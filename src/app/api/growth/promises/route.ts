// 1on1の約束の取り組み状況API（指示書179 C）
//   GET [?user=] → { promises: [{ oneOnOneKey, ownerId, heldOn, partnerName, mode, text, status, note }], tableMissing }
//       本人＝自分が記録者または相手として参加した1on1の約束（112の閲覧規則と同じ範囲）。
//       他人の分は **管理者のみ**（基盤の「管理者＝全レコード閲覧可」の範囲）
//   PUT { oneOnOneKey, ownerId, status, note } → **本人のみ**取り組み状況を書く
//
// 約束の本文は1on1ノート側にあり、ここでは一切変更しない（C: 変更は1on1ノート側の既存の権限に従う）。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchPromiseStatuses,
  recordGrowthLog,
  savePromiseStatus,
  type GrowthAdminClient,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { normalizeOneOnOneData } from "@/lib/one-on-one";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import {
  isPromiseStatus,
  normalizePromiseStatus,
  promiseStatusId,
  promiseStatusLabel,
  promiseTextOf,
} from "@/lib/staff-growth";

export const runtime = "nodejs";

type PrivateRow = { owner_id: string; record_key: string; data: unknown };

/**
 * その人が関わる1on1（記録者 or 相手）。
 * /api/private-store の involved=1 と同じ2クエリ（owner=本人／participantIds contains 本人）。
 */
async function listInvolvedOneOnOne(admin: GrowthAdminClient, userId: string): Promise<PrivateRow[]> {
  const [mine, joined] = await Promise.all([
    admin
      .from("private_store")
      .select("owner_id, record_key, data")
      .eq("content_type", "one_on_one")
      .eq("owner_id", userId),
    admin
      .from("private_store")
      .select("owner_id, record_key, data")
      .eq("content_type", "one_on_one")
      .contains("data->participantIds", JSON.stringify([userId])),
  ]);
  if (mine.error) throw new Error(mine.error.message);
  if (joined.error) throw new Error(joined.error.message);
  const seen = new Set<string>();
  const out: PrivateRow[] = [];
  for (const r of [...(mine.data ?? []), ...(joined.data ?? [])] as PrivateRow[]) {
    const k = `${r.owner_id}/${r.record_key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  if (userParam && userParam !== auth.userId && !auth.isAdmin) return hidden();
  const userId = userParam || auth.userId;

  try {
    const [rows, { statuses, tableMissing }, roster] = await Promise.all([
      listInvolvedOneOnOne(auth.admin, userId),
      fetchPromiseStatuses(auth.admin, userId),
      loadProfilesIndexServer(),
    ]);
    const nameOf = (id: string, fallback: string) =>
      roster.find((p) => p.userId === id)?.name || fallback;
    const promises = rows
      .map((r) => {
        const d = normalizeOneOnOneData(r.data);
        const text = promiseTextOf(d);
        if (!d.heldOn || !text) return null;
        const st = statuses.find((s) => s.oneOnOneKey === r.record_key && s.ownerId === r.owner_id);
        const partnerName =
          r.owner_id === userId
            ? nameOf(d.participantIds[0] ?? "", d.partnerName || "相手")
            : nameOf(r.owner_id, d.authorName || "記録者");
        return {
          oneOnOneKey: r.record_key,
          ownerId: r.owner_id,
          heldOn: d.heldOn,
          partnerName,
          mode: d.mode,
          text,
          status: st?.status ?? null,
          note: st?.note ?? "",
          updatedAt: st?.updatedAt ?? "",
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.heldOn.localeCompare(a.heldOn));
    return NextResponse.json({ promises, tableMissing });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const oneOnOneKey = typeof body.oneOnOneKey === "string" ? body.oneOnOneKey : "";
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  if (!oneOnOneKey || !ownerId) return badRequest("対象の1on1が指定されていません");
  if (!isPromiseStatus(body.status)) return badRequest("取り組み状況の値が不正です");

  try {
    // 本人が関わる回でなければ「無い」のと同じ（存在を知らせない）
    const rows = await listInvolvedOneOnOne(auth.admin, auth.userId);
    const row = rows.find((r) => r.record_key === oneOnOneKey && r.owner_id === ownerId);
    if (!row) return hidden();

    const { statuses } = await fetchPromiseStatuses(auth.admin, auth.userId);
    const prev = statuses.find((s) => s.oneOnOneKey === oneOnOneKey && s.ownerId === ownerId) ?? null;
    const next = normalizePromiseStatus(promiseStatusId(auth.userId, ownerId, oneOnOneKey), {
      userId: auth.userId,
      oneOnOneKey,
      ownerId,
      status: body.status,
      note: typeof body.note === "string" ? body.note : prev?.note ?? "",
      updatedAt: new Date().toISOString(),
    });
    if (!next) return badRequest("保存できませんでした");
    const by = auth.userEmail || auth.userId;
    await savePromiseStatus(auth.admin, next, by);
    const changes = [];
    if ((prev?.status ?? "") !== next.status) {
      changes.push({
        field: "取り組み状況",
        before: prev ? promiseStatusLabel(prev.status) : "",
        after: promiseStatusLabel(next.status),
      });
    }
    if ((prev?.note ?? "") !== next.note) {
      changes.push({
        field: "メモ",
        before: prev?.note.trim() ? "記載あり" : "空",
        after: next.note.trim() ? (prev?.note.trim() ? "記載あり（変更）" : "記載あり") : "空",
      });
    }
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, { by, action: "更新", kind: "1on1の約束", target: "本人", changes });
    }
    return NextResponse.json({ status: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
