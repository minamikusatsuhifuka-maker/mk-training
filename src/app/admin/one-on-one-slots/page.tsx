"use client";

// 🗓 1on1の日程（指示書205 §1）— **院長のみ**（🔒・admin-items.ts で delegable: false）
//
// ・期間を作る：実施期間・曜日・時間帯（既定13:00〜15:00）・刻み（5/10/15/30分）・対象スタッフ
//   → 作る前に**枠の数と最初・最後の枠**を見せて確認してから作成
// ・日ごとの表示：空き／予約済み（氏名）／ブロック。「この日をすべてブロック」「ブロックを解除」はワンクリック
// ・空き枠の✕は確認なしで削除し、直後に「元に戻す」を出す
// ・予約済みの枠を含むブロック・削除は確認を出し、実行すると予約を取り消して本人に取り直しの知らせ
// ・過去の枠は操作できない
// ・予約の一覧：今日・明日の1on1／期間ごとに予約済み（日時）と未予約／代わりに予約・変更・取り消し
// ・院長への知らせ（予約・変更・取り消し）。早さや回数は数えない（205 §5）
//
// 到達可否は proxy.ts と admin/layout.tsx が判定し、APIは requireAdmin で止める。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BOOKING_CHANGE_DAYS,
  DEFAULT_SLOT_FROM,
  DEFAULT_SLOT_TO,
  SLOT_STEPS,
  WEEKDAY_LABELS,
  bookingNoticeText,
  canStaffChange,
  slotChangeLine,
  formatDateW,
  groupByDate,
  planSummaryText,
  slotTimeLabel,
  sortSlots,
  summarizePlan,
  unbookedStaffIds,
  validatePeriod,
  type Booking,
  type BookingNotice,
  type PeriodInput,
  type Slot,
  type SlotChange,
  type SlotPeriod,
  type SlotStep,
} from "@/lib/one-on-one-slots";

type StaffRow = { userId: string; name: string; testSeed: boolean };
type Payload = {
  periods: SlotPeriod[];
  slots: Slot[];
  bookings: Booking[];
  notices: BookingNotice[];
  /** 226 §2: 誰がいつ日程を変えたか（新しい順） */
  changes: SlotChange[];
  staff: StaffRow[];
  today: string;
  /** 226 §2: 開いているのが院長か（委任された幹部なら false） */
  isAdmin: boolean;
};

/** 226 §2: 変更の記録を画面に出す件数 */
const SLOT_CHANGES_SHOWN = 20;

/** 変更の記録の日時（日本時間・「10/09 13:05」） */
function formatChangedAt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const jst = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(jst.getUTCMonth() + 1)}/${p2(jst.getUTCDate())} ${p2(jst.getUTCHours())}:${p2(jst.getUTCMinutes())}`;
}

const EMPTY_FORM = (): PeriodInput => ({
  startDate: "",
  endDate: "",
  weekdays: [],
  fromTime: DEFAULT_SLOT_FROM,
  toTime: DEFAULT_SLOT_TO,
  stepMinutes: 15,
  staffIds: [],
  label: "",
});

export default function OneOnOneSlotsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<PeriodInput>(EMPTY_FORM);
  const [staffPicked, setStaffPicked] = useState<Set<string> | null>(null);
  const [confirmPlan, setConfirmPlan] = useState(false);
  /** 直前に消した枠（「元に戻す」用） */
  const [undoSlot, setUndoSlot] = useState<Slot | null>(null);
  const [openPeriod, setOpenPeriod] = useState("");
  const [bookFor, setBookFor] = useState<{ slot: Slot; userId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/one-on-one-slots", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      setData({
        periods: j.periods ?? [],
        slots: j.slots ?? [],
        bookings: j.bookings ?? [],
        notices: j.notices ?? [],
        changes: j.changes ?? [],
        staff: j.staff ?? [],
        today: j.today ?? "",
        isAdmin: j.isAdmin !== false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 対象スタッフの既定は全員（院長・無効化済みは入っていない）
  useEffect(() => {
    if (!data || staffPicked !== null) return;
    setStaffPicked(new Set(data.staff.map((s) => s.userId)));
  }, [data, staffPicked]);

  const picked = useMemo(() => Array.from(staffPicked ?? []), [staffPicked]);
  const input: PeriodInput = useMemo(() => ({ ...form, staffIds: picked }), [form, picked]);
  const plan = useMemo(() => summarizePlan(input), [input]);
  const problem = useMemo(() => validatePeriod(input), [input]);

  const nameOf = useCallback(
    (userId: string) => data?.staff.find((s) => s.userId === userId)?.name ?? "名前未設定",
    [data]
  );

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
  };

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError("");
    try {
      const res = await fetch("/api/admin/one-on-one-slots", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(j.error || "できませんでした");
      await load();
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "できませんでした");
      return null;
    } finally {
      setBusy("");
    }
  };

  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError("");
    try {
      const res = await fetch("/api/admin/one-on-one-slots", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(j.error || "できませんでした");
      await load();
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "できませんでした");
      return null;
    } finally {
      setBusy("");
    }
  };

  const create = async () => {
    const j = await post({ action: "create", period: input }, "create");
    if (!j) return;
    setConfirmPlan(false);
    setForm(EMPTY_FORM());
    flash(`枠を${j.created ?? 0}個作りました。`);
  };

  const extend = async (p: SlotPeriod) => {
    const j = await post(
      {
        action: "extend",
        periodId: p.id,
        period: {
          startDate: p.startDate,
          endDate: p.endDate,
          weekdays: p.weekdays,
          fromTime: p.fromTime,
          toTime: p.toTime,
          stepMinutes: p.stepMinutes,
          staffIds: p.staffIds,
          label: p.label,
        },
      },
      `extend:${p.id}`
    );
    if (!j) return;
    flash(`足りない枠を${j.created ?? 0}個足しました（既にある枠と予約はそのままです）。`);
  };

  const bookingOf = useCallback(
    (slotId: string) => data?.bookings.find((b) => b.slotId === slotId) ?? null,
    [data]
  );

  const blockDay = async (p: SlotPeriod, date: string, blocked: boolean) => {
    const target = (data?.slots ?? []).filter((s) => s.periodId === p.id && s.date === date);
    const withBooking = target.filter((s) => bookingOf(s.id));
    if (blocked && withBooking.length > 0) {
      const names = withBooking.map((s) => nameOf(bookingOf(s.id)!.userId)).join("・");
      if (!confirm(`${names}さんの予約が入っています。\nブロックすると予約を取り消し、本人に取り直しをお願いします。\n\nよろしいですか？`)) return;
    }
    const j = await patch(
      { action: blocked ? "blockDay" : "unblockDay", periodId: p.id, date },
      `day:${date}`
    );
    if (!j) return;
    flash(
      blocked
        ? `${formatDateW(date)} をすべてブロックしました${Number(j.released ?? 0) > 0 ? `（${j.released}件の予約を取り消し、本人に知らせました）` : ""}。`
        : `${formatDateW(date)} のブロックを解除しました。`
    );
  };

  const removeSlot = async (s: Slot) => {
    const b = bookingOf(s.id);
    if (b) {
      if (!confirm(`${nameOf(b.userId)}さんの予約が入っています。\n削除すると予約を取り消し、本人に取り直しをお願いします。\n\nよろしいですか？`)) return;
    }
    // 空き枠は確認なしで削除し、直後に「元に戻す」を出す（205 §1-2）
    const j = await patch({ action: "deleteSlot", slotId: s.id }, `del:${s.id}`);
    if (!j) return;
    setUndoSlot((j.removed as Slot | undefined) ?? s);
    flash(`${formatDateW(s.date)} ${slotTimeLabel(s)} の枠を削除しました。`);
  };

  const undo = async () => {
    if (!undoSlot) return;
    const j = await patch({ action: "restoreSlot", slot: undoSlot }, "undo");
    if (!j) return;
    setUndoSlot(null);
    flash("枠を元に戻しました。");
  };

  const cancelBooking = async (s: Slot) => {
    const b = bookingOf(s.id);
    if (!b) return;
    if (!confirm(`${nameOf(b.userId)}さんの予約を取り消しますか？（枠は空きに戻ります）`)) return;
    const j = await patch({ action: "cancel", slotId: s.id }, `cancel:${s.id}`);
    if (!j) return;
    flash("予約を取り消しました。");
  };

  const doBookFor = async () => {
    if (!bookFor) return;
    const j = await patch(
      { action: "bookFor", slotId: bookFor.slot.id, userId: bookFor.userId },
      "bookFor"
    );
    if (!j) return;
    setBookFor(null);
    flash(`${nameOf(bookFor.userId)}さんの予約を入れました。`);
  };

  const clearNotices = async () => {
    setBusy("notices");
    try {
      const res = await fetch("/api/admin/one-on-one-slots", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) await load();
    } finally {
      setBusy("");
    }
  };

  if (!data) {
    return <p className="text-sm text-slate-500">読み込み中...</p>;
  }

  const today = data.today;
  const todayTomorrow = sortSlots(
    data.bookings.filter((b) => b.date === today || b.date > today)
  ).filter((b) => b.date === today || b.date === addOne(today));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🗓 1on1の日程</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          実施期間・曜日・時間帯・刻みを決めて枠を作ると、スタッフが空き枠を自分で選んで予約します
          （相手は院長）。予約は「次回1on1の予定」として登録され、事前アンケートの期限もそこから決まります。
          スタッフが自分で予約・変更・取り消しできるのは実施日の{BOOKING_CHANGE_DAYS}日前までです（院長はいつでもできます）。
        </p>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
          {undoSlot && (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy === "undo"}
              data-slot-undo
              className="ml-2 underline underline-offset-2"
            >
              元に戻す
            </button>
          )}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert" data-slot-error>
          {error}
        </p>
      )}

      {/* 今日・明日の1on1（205 §1-3） */}
      <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4" data-slot-today>
        <h2 className="text-sm font-bold text-teal-900">今日・明日の1on1</h2>
        {todayTomorrow.length === 0 ? (
          <p className="mt-1 text-xs text-teal-900">予定はありません。</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
            {todayTomorrow.map((b) => (
              <li key={b.id}>
                {formatDateW(b.date)} {b.startTime}〜{b.endTime}　{nameOf(b.userId)}さん
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 院長への知らせ（205 §4） */}
      {data.notices.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-slot-notices>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-amber-900">予約の動き</h2>
            <button
              type="button"
              onClick={() => void clearNotices()}
              disabled={busy === "notices"}
              data-slot-notices-clear
              className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-900 disabled:opacity-50"
            >
              確認した（消す）
            </button>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-800">
            {data.notices.map((n) => (
              <li key={n.id} data-slot-notice={n.kind}>
                {bookingNoticeText(n)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 226 §2: 日程の変更の記録（誰がいつ変えたか）。委任した相手の操作もここに出る */}
      {data.changes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4" data-slot-changes>
          <h2 className="text-sm font-bold text-slate-800">日程の変更の記録</h2>
          <p className="mt-1 text-[11px] text-slate-600">
            誰がいつ日程を変えたかの記録です（新しい順・{SLOT_CHANGES_SHOWN}件まで）。
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-slate-800">
            {data.changes.slice(0, SLOT_CHANGES_SHOWN).map((c) => (
              <li key={c.id} data-slot-change={c.action}>
                <span className="text-slate-500">{formatChangedAt(c.at)}</span>　{slotChangeLine(c)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 期間を作る（205 §1-1） */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-slot-form>
        <h2 className="text-base font-bold text-slate-800">期間を作る</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-600">
            実施期間（開始日）
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              data-slot-start
              className="mt-0.5 h-9 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            実施期間（終了日）
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              data-slot-end
              className="mt-0.5 h-9 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            時間帯（開始）
            <Input
              type="time"
              step={300}
              value={form.fromTime}
              onChange={(e) => setForm((f) => ({ ...f, fromTime: e.target.value }))}
              data-slot-from
              className="mt-0.5 h-9 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            時間帯（終了）
            <Input
              type="time"
              step={300}
              value={form.toTime}
              onChange={(e) => setForm((f) => ({ ...f, toTime: e.target.value }))}
              data-slot-to
              className="mt-0.5 h-9 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            刻み
            <select
              value={form.stepMinutes}
              onChange={(e) => setForm((f) => ({ ...f, stepMinutes: Number(e.target.value) as SlotStep }))}
              data-slot-step
              className="mt-0.5 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              {SLOT_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s}分
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            名前（任意・一覧の見出しに使う）
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="例：10月の1on1"
              className="mt-0.5 h-9 text-sm"
            />
          </label>
        </div>

        <div>
          <p className="text-xs text-slate-600">曜日（複数選べます）</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => {
              const on = form.weekdays.includes(d);
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      weekdays: on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort(),
                    }))
                  }
                  data-slot-weekday={d}
                  aria-pressed={on}
                  className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm ${
                    on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-600">対象スタッフ（既定は全員）</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {data.staff.map((s) => {
              const on = staffPicked?.has(s.userId) ?? false;
              return (
                <label
                  key={s.userId}
                  className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setStaffPicked((prev) => {
                        const next = new Set(prev ?? []);
                        if (e.target.checked) next.add(s.userId);
                        else next.delete(s.userId);
                        return next;
                      })
                    }
                    data-slot-staff={s.userId}
                  />
                  {s.name}
                  {s.testSeed && <span className="text-[10px] text-violet-700">🧪</span>}
                </label>
              );
            })}
          </div>
        </div>

        {problem ? (
          <p className="text-xs text-amber-800">{problem}</p>
        ) : (
          <p className="text-xs text-slate-700" data-slot-plan>
            {planSummaryText(plan)}
          </p>
        )}

        {!confirmPlan ? (
          <Button type="button" onClick={() => setConfirmPlan(true)} disabled={!!problem || plan.count === 0} data-slot-plan-open>
            枠を作る
          </Button>
        ) : (
          <div className="space-y-2 rounded-lg border-2 border-teal-300 bg-teal-50/60 p-3" data-slot-confirm>
            <p className="text-sm text-slate-900">{planSummaryText(plan)}</p>
            <p className="text-xs text-slate-600">対象スタッフ {picked.length}人。この内容で作りますか？</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void create()} disabled={busy === "create"} data-slot-create>
                {busy === "create" ? "作っています…" : "この内容で作る"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmPlan(false)}>
                やめる
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 期間ごとの枠と予約 */}
      {data.periods.length === 0 ? (
        <p className="text-sm text-slate-500">まだ期間がありません。</p>
      ) : (
        data.periods.map((p) => {
          const slots = sortSlots(data.slots.filter((s) => s.periodId === p.id));
          const bookings = data.bookings.filter((b) => b.periodId === p.id);
          const unbooked = unbookedStaffIds(p, bookings);
          const open = openPeriod === p.id;
          return (
            <section key={p.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-slot-period={p.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  {p.label || `${formatDateW(p.startDate)}〜${formatDateW(p.endDate)}`}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {p.weekdays.map((d) => WEEKDAY_LABELS[d]).join("・")}／{p.fromTime}〜{p.toTime}／{p.stepMinutes}分／
                    枠{slots.length}・予約{bookings.length}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => void extend(p)} disabled={busy === `extend:${p.id}`} data-slot-extend={p.id}>
                    枠を足す
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpenPeriod(open ? "" : p.id)} data-slot-toggle={p.id}>
                    {open ? "枠をたたむ" : "枠を見る"}
                  </Button>
                </div>
              </div>

              {/* 予約の一覧（205 §1-3） */}
              <div className="rounded-lg bg-slate-50 p-3 text-xs" data-slot-bookings={p.id}>
                <p className="font-medium text-slate-700">対象スタッフ {p.staffIds.length}人</p>
                <ul className="mt-1 space-y-0.5">
                  {p.staffIds.map((id) => {
                    const b = bookings.find((x) => x.userId === id);
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-2 text-slate-800" data-slot-staff-row={id}>
                        <span className="min-w-[8rem] font-medium">{nameOf(id)}</span>
                        {b ? (
                          <>
                            <span>
                              {formatDateW(b.date)} {b.startTime}〜{b.endTime}
                            </span>
                            {!canStaffChange(b.date, today) && (
                              <span className="text-[10px] text-amber-800">本人は変更できない時期</span>
                            )}
                          </>
                        ) : (
                          <span className="text-amber-800">未予約</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {unbooked.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-800">
                    未予約：{unbooked.map(nameOf).join("・")}
                  </p>
                )}
              </div>

              {/* 日ごとの枠（205 §1-2） */}
              {open && (
                <div className="space-y-3">
                  {groupByDate(slots).map(({ date, items }) => {
                    const past = date < today;
                    const allBlocked = items.every((s) => s.blocked);
                    return (
                      <div key={date} className="space-y-1.5 border-t border-slate-100 pt-2" data-slot-day={date}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {formatDateW(date)}
                            {past && <span className="ml-1 text-[10px] text-slate-400">（過ぎた日）</span>}
                          </p>
                          {!past && (
                            <button
                              type="button"
                              onClick={() => void blockDay(p, date, !allBlocked)}
                              disabled={busy === `day:${date}`}
                              data-slot-block-day={date}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
                            >
                              {allBlocked ? "ブロックを解除" : "この日をすべてブロック"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((s) => {
                            const b = bookingOf(s.id);
                            return (
                              <span
                                key={s.id}
                                data-slot={s.id}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                                  b
                                    ? "border-teal-300 bg-teal-50 text-teal-900"
                                    : s.blocked
                                      ? "border-slate-300 bg-slate-200 text-slate-500"
                                      : "border-slate-300 bg-white text-slate-700"
                                }`}
                              >
                                <span>{slotTimeLabel(s)}</span>
                                {b ? (
                                  <span className="font-medium" data-slot-booked={s.id}>
                                    {nameOf(b.userId)}さん
                                  </span>
                                ) : s.blocked ? (
                                  <span data-slot-blocked={s.id}>ブロック</span>
                                ) : (
                                  <span className="text-slate-400">空き</span>
                                )}
                                {!past && b && (
                                  <button
                                    type="button"
                                    onClick={() => void cancelBooking(s)}
                                    disabled={busy === `cancel:${s.id}`}
                                    data-slot-cancel={s.id}
                                    className="text-rose-700"
                                    title="この予約を取り消す"
                                  >
                                    取消
                                  </button>
                                )}
                                {!past && !b && !s.blocked && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setBookFor({ slot: s, userId: p.staffIds[0] ?? "" })}
                                      data-slot-bookfor={s.id}
                                      className="text-teal-700"
                                      title="代わりに予約する"
                                    >
                                      入れる
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void removeSlot(s)}
                                      disabled={busy === `del:${s.id}`}
                                      data-slot-delete={s.id}
                                      className="text-slate-500"
                                      title="この枠を削除"
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}

      {/* 代わりに予約（205 §1-3） */}
      {bookFor && (
        <div className="space-y-2 rounded-2xl border-2 border-teal-300 bg-white p-4" data-slot-bookfor-panel>
          <p className="text-sm text-slate-900">
            {formatDateW(bookFor.slot.date)} {slotTimeLabel(bookFor.slot)} に代わりに予約します
          </p>
          <select
            value={bookFor.userId}
            onChange={(e) => setBookFor((v) => (v ? { ...v, userId: e.target.value } : v))}
            data-slot-bookfor-staff
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {data.staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
                {s.testSeed ? "（🧪 検証用）" : ""}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void doBookFor()} disabled={busy === "bookFor" || !bookFor.userId} data-slot-bookfor-submit>
              この人で予約する
            </Button>
            <Button type="button" variant="outline" onClick={() => setBookFor(null)}>
              やめる
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 翌日（今日・明日の1on1の判定用） */
function addOne(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
