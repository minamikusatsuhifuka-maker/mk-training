"use client";

// 次回1on1の予定と事前アンケートの知らせ（指示書197 B-2・C）
//   PresurveyAlertBanner  … ホーム上部の知らせ（本人・未回答・機能フラグONのときだけ）
//   PresurveyNavMark      … メニューの印（マイ成長記録・事前アンケート）
//   MyNextOneOnOne        … マイ成長記録の「次回1on1：10月20日（火）15:00　院長と」
//   KarteScheduleCard     … 育成カルテの「次回1on1の予定」（院長・担当幹部が登録）
//   PartnerPresurveyStatus… 1on1画面の「担当する1on1の事前アンケート」（締切後は「未回答」・C-3）
// 回答の本文はどこにも出さない（「答えたか」だけ）。回答は評価に使わない。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  SCHEDULE_ANSWER_LABEL,
  formatMonthDay,
  formatScheduleLine,
  presurveyDeadline,
  type ScheduleAnswerState,
  type ScheduleView,
} from "@/lib/one-on-one-schedule";
import { activeAlerts, useMySchedules } from "@/lib/one-on-one-schedule-client";

const PRESURVEY_HREF = "/one-on-one/presurvey";

const STATE_CLASS: Record<ScheduleAnswerState, string> = {
  answered: "bg-teal-50 text-teal-800 border-teal-200",
  waiting: "bg-gray-50 text-gray-700 border-gray-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
};

export function AnswerStateBadge({ s }: { s: ScheduleView }) {
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${STATE_CLASS[s.state]}`} data-presurvey-state={s.state}>
      {SCHEDULE_ANSWER_LABEL[s.state]}
      {s.state === "waiting" && `（締切 ${formatMonthDay(presurveyDeadline(s))}）`}
    </span>
  );
}

/** ホーム上部（C-2）。ログインするたびに出る。回答すると消える */
export function PresurveyAlertBanner() {
  const data = useMySchedules();
  const alerts = activeAlerts(data);
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-1.5" data-presurvey-banner>
      {alerts.map((a) => (
        <Link
          key={a.scheduleId}
          href={`${PRESURVEY_HREF}?schedule=${encodeURIComponent(a.scheduleId)}`}
          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm min-h-[44px] ${
            a.stage === "deadline" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
          data-presurvey-alert={a.stage}
        >
          <span className="min-w-0">📝 {a.message}</span>
          <span className="shrink-0 text-xs underline underline-offset-2">回答する →</span>
        </Link>
      ))}
    </div>
  );
}

/** メニューの印（C-2）。知らせが出ている間だけ */
export function PresurveyNavMark({ href }: { href: string }) {
  const data = useMySchedules();
  if (href !== "/my-growth" && href !== PRESURVEY_HREF) return null;
  if (activeAlerts(data).length === 0) return null;
  return (
    <span className="ml-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" data-presurvey-nav-mark>
      <span className="sr-only">（1on1の事前アンケートが未回答です）</span>
    </span>
  );
}

/** マイ成長記録（B-2）: 次回1on1と、事前アンケートへの導線 */
export function MyNextOneOnOne() {
  const data = useMySchedules();
  if (!data || data.mine.length === 0) return null;
  const next = data.mine[0];
  return (
    <section className="rounded-xl border border-teal-200 bg-white p-3 space-y-1.5" data-my-next-1on1>
      <p className="text-sm text-gray-900">
        🗓 次回1on1：<span className="font-medium">{formatScheduleLine(next)}</span>
      </p>
      {data.alertsEnabled && (
        <p className="text-[12px] flex flex-wrap items-center gap-2">
          <AnswerStateBadge s={next} />
          {!next.answered && (
            <Link href={`${PRESURVEY_HREF}?schedule=${encodeURIComponent(next.id)}`} className="text-teal-800 underline underline-offset-2">
              事前アンケートに答える{next.alert ? <PresurveyNavMark href="/my-growth" /> : null}
            </Link>
          )}
        </p>
      )}
      {data.mine.length > 1 && (
        <p className="text-[11px] text-gray-500">その後の予定: {data.mine.slice(1, 4).map(formatScheduleLine).join("／")}</p>
      )}
    </section>
  );
}

/** 1on1画面（C-3）: 自分が担当する1on1の事前アンケートの状態。締切を過ぎて未回答なら「未回答」 */
export function PartnerPresurveyStatus() {
  const data = useMySchedules();
  if (!data || data.partner.length === 0) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5" data-partner-presurvey>
      <h2 className="text-sm font-medium text-gray-900">🗓 担当する1on1の事前アンケート</h2>
      <ul className="space-y-1">
        {data.partner.slice(0, 20).map((s) => (
          <li key={s.id} className="text-[12px] text-gray-900 flex flex-wrap items-center gap-2" data-partner-schedule={s.state}>
            <span>
              {formatScheduleLine(s).split("　")[0]}　{s.staffName}さん
            </span>
            <AnswerStateBadge s={s} />
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-gray-500">回答は1on1を選ぶと各欄の隣に出ます。未回答でも1on1は予定どおり行えます。</p>
    </section>
  );
}

// ─── 育成カルテ（院長・担当幹部が登録） ───

type Candidate = { userId: string; name: string; isDirector: boolean };
type KarteScheduleResponse = {
  schedules: ScheduleView[];
  candidates: Candidate[];
  today: string;
  isAdmin: boolean;
  tableMissing?: boolean;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

export function KarteScheduleCard({ userId }: { userId: string }) {
  const [data, setData] = useState<KarteScheduleResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ id: string; date: string; time: string; partnerId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<KarteScheduleResponse>(`/api/growth/schedule?user=${encodeURIComponent(userId)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () =>
    setForm({ id: "", date: "", time: "", partnerId: data?.candidates.find((c) => c.isDirector)?.userId ?? data?.candidates[0]?.userId ?? "" });

  const save = async () => {
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/growth/schedule", { method: "POST", body: JSON.stringify({ userId, ...form, id: form.id || undefined }) });
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: ScheduleView) => {
    if (busy || !confirm(`${formatScheduleLine(s)} の予定を削除しますか？`)) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/growth/schedule", { method: "DELETE", body: JSON.stringify({ id: s.id }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="text-[11px] text-gray-500">{error || "読み込み中…"}</p>;
  if (data.tableMissing) return <p className="text-[11px] text-gray-500">育成カルテのテーブルがまだ作られていません。</p>;

  return (
    <div className="space-y-1.5" data-karte-schedule>
      {data.schedules.length === 0 ? (
        <p className="text-[11px] text-gray-500">予定はまだありません。</p>
      ) : (
        <ul className="space-y-1">
          {data.schedules.map((s) => (
            <li key={s.id} className="text-[12px] text-gray-900" data-karte-schedule-item={s.state}>
              <span className="block">{formatScheduleLine(s)}</span>
              <span className="flex flex-wrap items-center gap-2">
                <AnswerStateBadge s={s} />
                {s.editable && (
                  <>
                    <button type="button" disabled={busy} onClick={() => setForm({ id: s.id, date: s.date, time: s.time, partnerId: s.partnerId })} className="text-[11px] text-teal-800 underline underline-offset-2">
                      変更
                    </button>
                    <button type="button" disabled={busy} onClick={() => void remove(s)} className="text-[11px] text-red-700 underline underline-offset-2">
                      削除
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      {form ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-2 space-y-1.5" data-karte-schedule-form>
          <div className="flex flex-wrap gap-1.5">
            <input type="date" value={form.date} min={data.today} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 rounded border border-gray-300 px-2 text-sm" aria-label="1on1の日付" />
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="h-9 rounded border border-gray-300 px-2 text-sm" aria-label="1on1の開始時刻" />
            <select value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })} className="h-9 rounded border border-gray-300 px-2 text-sm" aria-label="担当者">
              {data.candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.isDirector ? `院長（${c.name}）` : c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-gray-500">登録すると、本人のマイ成長記録に予定が出て、事前アンケート（締切は3日前）が届きます。</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || !form.date || !form.partnerId} onClick={() => void save()} className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-[12px] hover:bg-teal-700 disabled:opacity-40 min-h-[36px]">
              {busy ? "保存中…" : form.id ? "変更を保存" : "予定を登録"}
            </button>
            <button type="button" disabled={busy} onClick={() => setForm(null)} className="px-3 py-1.5 border border-gray-300 rounded-full text-[12px] min-h-[36px]">
              やめる
            </button>
          </div>
        </div>
      ) : (
        data.candidates.length > 0 && (
          <button type="button" onClick={openNew} className="text-[12px] text-teal-800 underline underline-offset-2" data-karte-schedule-add>
            ＋ 次回1on1の予定を登録
          </button>
        )
      )}
    </div>
  );
}
