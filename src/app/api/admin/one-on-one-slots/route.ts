// 1on1の日程調整（指示書205 §1）— **院長のみ**（requireAdmin）
//
//   GET    → { periods, slots, bookings, notices, staff, today }
//   POST   → 期間を作る／枠を足す  body: { action: "create" | "extend", period, periodId? }
//   PATCH  → ブロック・解除・削除・元に戻す・代わりに予約・取り消し
//   DELETE → 院長への知らせを消す（既読にする）
//
// 枠と予約の一覧（氏名つき）は**院長のみ**（205 §5）。非管理者には proxy が実在しないAPIと同じ応答を返し、
// ここでも requireAdmin で止める。
//
// 置き場所は既存の clinic_staff_growth（RLS全拒否・service-role のみ）。**交付するSQLは無い**。
// 同じ枠の二重予約は予約の行id（`booking-<枠id>`）＋insert の一意制約で防ぐ（one-on-one-slots-server）。

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GrowthTableMissingError } from "@/lib/staff-growth-server";
import { loadPeople } from "@/lib/one-on-one-schedule-server";
import { isTestSeedUser } from "@/lib/test-seed";
import { jstTodayYmd } from "@/lib/library";
import {
  DirectorBusyError,
  SlotTakenError,
  bookSlot,
  cancelBooking,
  clearNotices,
  deleteSlot,
  ensureSlots,
  fetchBookings,
  fetchNotices,
  fetchPeriods,
  fetchSlots,
  restoreSlot,
  savePeriod,
  setSlotBlocked,
} from "@/lib/one-on-one-slots-server";
import {
  SLOT_MAX_PER_PERIOD,
  newPeriodId,
  normalizeSlotPeriod,
  summarizePlan,
  validatePeriod,
  type PeriodInput,
  type Slot,
} from "@/lib/one-on-one-slots";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof GrowthTableMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  if (e instanceof SlotTakenError || e instanceof DirectorBusyError) {
    return NextResponse.json({ error: e.message, code: "taken" }, { status: 409 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readPeriodInput(raw: unknown): PeriodInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    startDate: typeof o.startDate === "string" ? o.startDate : "",
    endDate: typeof o.endDate === "string" ? o.endDate : "",
    weekdays: Array.isArray(o.weekdays) ? o.weekdays.filter((d): d is number => typeof d === "number") : [],
    fromTime: typeof o.fromTime === "string" ? o.fromTime : "",
    toTime: typeof o.toTime === "string" ? o.toTime : "",
    stepMinutes: typeof o.stepMinutes === "number" ? o.stepMinutes : 0,
    staffIds: Array.isArray(o.staffIds) ? o.staffIds.filter((x): x is string => typeof x === "string") : [],
    label: typeof o.label === "string" ? o.label : "",
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const admin = createSupabaseAdminClient();
    const [periods, slots, bookings, notices, people, users] = await Promise.all([
      fetchPeriods(admin),
      fetchSlots(admin),
      fetchBookings(admin),
      fetchNotices(admin),
      loadPeople(admin),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const testIds = new Set((users.data?.users ?? []).filter(isTestSeedUser).map((u) => u.id));
    const staff = Array.from(people.values())
      .filter((p) => !p.isDirector)
      .map((p) => ({ userId: p.userId, name: p.name, testSeed: testIds.has(p.userId) }))
      .sort((a, b) => Number(a.testSeed) - Number(b.testSeed) || a.name.localeCompare(b.name, "ja"));
    return NextResponse.json({
      periods,
      slots,
      bookings,
      notices,
      staff,
      today: jstTodayYmd(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await readBody(req);
  const input = readPeriodInput(body.period);
  if (!input) return bad("不正なリクエストです");
  const problem = validatePeriod(input);
  if (problem) return bad(problem);
  const plan = summarizePlan(input);
  if (plan.count === 0) return bad("作れる枠がありません（曜日・時間帯・刻みを見直してください）");
  if (plan.tooMany) return bad(`枠が多すぎます（${plan.count}枠）。${SLOT_MAX_PER_PERIOD}枠までにしてください`);

  const by = auth.user.email ?? auth.user.id;
  try {
    const admin = createSupabaseAdminClient();
    const action = body.action === "extend" ? "extend" : "create";
    const now = new Date().toISOString();

    if (action === "extend") {
      const periodId = typeof body.periodId === "string" ? body.periodId : "";
      const periods = await fetchPeriods(admin);
      const prev = periods.find((p) => p.id === periodId);
      if (!prev) return NextResponse.json({ error: "対象の期間が見つかりません" }, { status: 404 });
      // 既存の枠・予約は動かさず、足りない枠だけ作る（205 §1-1）
      const next = normalizeSlotPeriod(prev.id, {
        ...(prev as unknown as Record<string, unknown>),
        ...input,
        createdBy: prev.createdBy,
        createdAt: prev.createdAt,
        updatedAt: now,
      })!;
      await savePeriod(admin, next, by);
      const r = await ensureSlots(admin, next, input, by);
      return NextResponse.json({ period: next, ...r });
    }

    const period = normalizeSlotPeriod(newPeriodId(), {
      ...input,
      createdBy: by,
      createdAt: now,
      updatedAt: now,
    })!;
    await savePeriod(admin, period, by);
    const r = await ensureSlots(admin, period, input, by);
    return NextResponse.json({ period, ...r });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await readBody(req);
  const action = typeof body.action === "string" ? body.action : "";
  const by = auth.user.email ?? auth.user.id;
  const today = jstTodayYmd();

  try {
    const admin = createSupabaseAdminClient();
    const [slots, bookings, people] = await Promise.all([
      fetchSlots(admin),
      fetchBookings(admin),
      loadPeople(admin),
    ]);
    const nameOf = (id: string) => people.get(id)?.name ?? "名前未設定";
    const byId = new Map(slots.map((s) => [s.id, s]));
    const bookingOf = (slotId: string) => bookings.find((b) => b.slotId === slotId) ?? null;

    /** 予約が入っている枠を外す（取り消して本人に取り直しの知らせ・205 §1-2） */
    const release = async (target: Slot[]) => {
      let released = 0;
      for (const s of target) {
        const b = bookingOf(s.id);
        if (!b) continue;
        await cancelBooking(admin, { booking: b, staffName: nameOf(b.userId), by, kind: "released" });
        released += 1;
      }
      return released;
    };

    if (action === "blockDay" || action === "unblockDay") {
      const periodId = typeof body.periodId === "string" ? body.periodId : "";
      const date = typeof body.date === "string" ? body.date : "";
      if (!periodId || !date) return bad("対象の日がわかりません");
      const target = slots.filter((s) => s.periodId === periodId && s.date === date && s.date >= today);
      if (target.length === 0) return bad("その日に動かせる枠がありません（過ぎた枠は操作できません）");
      const blocked = action === "blockDay";
      const released = blocked ? await release(target) : 0;
      for (const s of target) await setSlotBlocked(admin, s, blocked, by);
      return NextResponse.json({ ok: true, changed: target.length, released });
    }

    if (action === "deleteSlot" || action === "blockSlot") {
      const id = typeof body.slotId === "string" ? body.slotId : "";
      const s = byId.get(id);
      if (!s) return NextResponse.json({ error: "対象の枠が見つかりません" }, { status: 404 });
      if (s.date < today) return bad("過ぎた枠は操作できません");
      const released = await release([s]);
      if (action === "deleteSlot") {
        await deleteSlot(admin, s.id);
        // 「元に戻す」で戻せるように、消した枠の中身を返す
        return NextResponse.json({ ok: true, released, removed: s });
      }
      await setSlotBlocked(admin, s, true, by);
      return NextResponse.json({ ok: true, released });
    }

    if (action === "restoreSlot") {
      const raw = body.slot;
      if (!raw || typeof raw !== "object") return bad("戻す枠がわかりません");
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      if (!id) return bad("戻す枠がわかりません");
      const { id: _drop, ...rest } = o;
      void _drop;
      const s = { ...(rest as Record<string, unknown>) };
      const normalized = byId.get(id) ?? null;
      if (normalized) return NextResponse.json({ ok: true, already: true });
      await restoreSlot(
        admin,
        {
          id,
          periodId: String(s.periodId ?? ""),
          date: String(s.date ?? ""),
          startTime: String(s.startTime ?? ""),
          endTime: String(s.endTime ?? ""),
          blocked: s.blocked === true,
          createdAt: String(s.createdAt ?? new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        },
        by
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "bookFor") {
      const id = typeof body.slotId === "string" ? body.slotId : "";
      const userId = typeof body.userId === "string" ? body.userId : "";
      const s = byId.get(id);
      if (!s || !userId) return NextResponse.json({ error: "対象がわかりません" }, { status: 404 });
      if (bookingOf(s.id)) return NextResponse.json({ error: "この枠はすでに予約されています", code: "taken" }, { status: 409 });
      // 院長は4日前を過ぎていても代わりに予約できる（205 §1-3）
      const r = await bookSlot(admin, {
        slot: s,
        userId,
        staffName: nameOf(userId),
        by,
        today,
      });
      return NextResponse.json({ ok: true, booking: r.booking, moved: r.moved });
    }

    if (action === "cancel") {
      const id = typeof body.slotId === "string" ? body.slotId : "";
      const b = bookingOf(id);
      if (!b) return NextResponse.json({ error: "対象の予約が見つかりません" }, { status: 404 });
      await cancelBooking(admin, { booking: b, staffName: nameOf(b.userId), by });
      return NextResponse.json({ ok: true });
    }

    return bad("不正なリクエストです");
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const admin = createSupabaseAdminClient();
    const cleared = await clearNotices(admin);
    return NextResponse.json({ ok: true, cleared });
  } catch (e) {
    return errorResponse(e);
  }
}
