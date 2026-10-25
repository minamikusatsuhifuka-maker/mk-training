"use client";

// 266: 年間計画を進めやすくする — 画面の部品
//
//   ValuePicker / ValueChips … 理念とのつながり（📜 当院の歩みと同じ言葉・同じ選び方）
//   WeeklySection            … 計画のくわしい内容の「今週のひとこと」（書く・新しい順に並べる）
//   WeekdaySetting           … 今週のひとことの知らせを出す曜日（院長だけ）
//   GanttMorning             … 🌅 朝礼サポートの「今週の計画」
//   WeeklyReflections        … 可能性ノートの1on1タブの「最近のふりかえり」（最近4週間）
// 判定はすべてサーバー（/api/gantt/weekly・/api/gantt/settings・/api/gantt/morning・/api/growth/weekly）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { C } from "./sakura-theme";
import { ganttApi, HelpMark, JudgeChip } from "./GanttTasks";
import { shortDate } from "@/lib/gantt";
import { timeLabel } from "@/lib/gantt-connect";
import {
  VALUE_GROUPS,
  WEEKDAY_LABELS,
  WEEKLY_TEXT_MAX,
  weekLabel,
  type MorningSummary,
  type MorningTask,
  type WeeklyNote,
} from "@/lib/gantt-rhythm";

const BORDER = "rgba(240, 209, 218, 0.9)";

// ─── 理念とのつながり ───

export function ValueChip({ word }: { word: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-[3px] text-[11px]" style={{ background: C.statusChip, color: C.statusText }} data-gantt-value={word}>
      {word}
    </span>
  );
}

export function ValueChips({ values }: { values: string[] }) {
  if (values.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" data-gantt-values>
      {values.map((w) => (
        <ValueChip key={w} word={w} />
      ))}
    </span>
  );
}

export function ValuePicker({ value, onChange, dataAttr = "data-gantt-f-values" }: { value: string[]; onChange: (v: string[]) => void; dataAttr?: string }) {
  const toggle = (w: string) => onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w]);
  return (
    <fieldset {...{ [dataAttr]: true }}>
      <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
        理念とのつながり（いくつでも・任意）
      </legend>
      {VALUE_GROUPS.map((g) => (
        <div key={g.label} className="mt-1.5">
          <p className="m-0 text-[11px]" style={{ color: C.sub }}>
            {g.label}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.words.map((w) => {
              const on = value.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(w)}
                  className="min-h-[38px] rounded-full border px-3 text-[13px]"
                  style={{ borderColor: on ? "#E7A6B8" : BORDER, background: on ? C.statusChip : "#FFFFFF", color: on ? C.statusText : C.ink, fontWeight: on ? 700 : 400 }}
                  data-gantt-f-value={w}
                >
                  {on ? "✓ " : ""}
                  {w}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

// ─── 今週のひとこと（計画のくわしい内容） ───

type WeeklyResp = { notes: WeeklyNote[]; canWrite: boolean; week: string };

export function WeeklySection({ planId, me }: { planId: string; me: string }) {
  const [data, setData] = useState<WeeklyResp | null>(null);
  const [form, setForm] = useState<{ done: string; next: string; trouble: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    ganttApi<WeeklyResp>(`/api/gantt/weekly?plan=${encodeURIComponent(planId)}`)
      .then(setData)
      .catch(() => setData(null));
  }, [planId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return null;
  const mineThisWeek = data.notes.find((n) => n.userId === me && n.week === data.week);
  if (data.notes.length === 0 && !data.canWrite) return null;

  const start = () => {
    setErr("");
    setMsg("");
    setForm({ done: mineThisWeek?.done ?? "", next: mineThisWeek?.next ?? "", trouble: mineThisWeek?.trouble ?? "" });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErr("");
    try {
      const j = await ganttApi<{ overwritten: boolean }>("/api/gantt/weekly", { method: "POST", body: JSON.stringify({ planId, ...form }) });
      setForm(null);
      setMsg(j.overwritten ? "今週の分を書き直しました" : "保存しました");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };
  const field = "mt-0.5 w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  const labels: [keyof NonNullable<typeof form>, string][] = [
    ["done", "できたこと"],
    ["next", "次の一歩"],
    ["trouble", "困りごと"],
  ];
  return (
    <section className="border-t px-[18px] pb-3 pt-3" style={{ borderColor: C.ruleHead }} aria-label="今週のひとこと" data-gantt-weekly={planId}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold">📝 今週のひとこと</span>
        {data.canWrite && !form && (
          <button type="button" onClick={start} className="min-h-[36px] rounded-full border bg-white px-3 text-[12px] font-bold" style={{ borderColor: BORDER, color: C.statusText }} data-gantt-weekly-write>
            {mineThisWeek ? "直す" : "書く"}（{weekLabel(data.week)}）
          </button>
        )}
      </div>
      {form && (
        <div className="space-y-1.5 rounded-2xl border p-3" style={{ borderColor: BORDER, background: "rgba(253, 248, 246, 0.95)" }} data-gantt-weekly-form>
          <p className="m-0 text-[11px]" style={{ color: C.sub }}>
            {weekLabel(data.week)}・それぞれ{WEEKLY_TEXT_MAX}字まで（どれか1つでもよい）
          </p>
          {labels.map(([k, label]) => (
            <label key={k} className="block text-[12px]" style={{ color: C.sub }}>
              {label}
              <textarea
                value={form[k]}
                rows={2}
                maxLength={WEEKLY_TEXT_MAX}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className={field}
                style={{ borderColor: BORDER, color: C.ink }}
                data-gantt-weekly-input={k}
              />
            </label>
          ))}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setForm(null)} className="min-h-[36px] rounded-full border bg-white px-4 text-[12px]" style={{ borderColor: BORDER, color: C.sub }}>
              閉じる
            </button>
            <button
              type="button"
              disabled={busy || !(form.done.trim() || form.next.trim() || form.trouble.trim())}
              onClick={() => void save()}
              className="min-h-[36px] rounded-full px-5 text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: C.hero }}
              data-gantt-weekly-save
            >
              {busy ? "保存しています…" : "保存"}
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p className="m-0 mt-1 text-[12px]" style={{ color: C.sub }} data-gantt-weekly-msg>
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="m-0 mt-1 rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FCEEF1", color: C.statusText }}>
          {err}
        </p>
      )}
      {data.notes.length === 0 ? (
        <p className="m-0 text-[12px]" style={{ color: C.sub }}>
          まだありません
        </p>
      ) : (
        <ul className="m-0 mt-1 list-none space-y-1.5 p-0">
          {data.notes.map((n) => (
            <li key={n.id} className="rounded-xl px-3 py-2" style={{ background: "rgba(252, 238, 241, 0.55)" }} data-gantt-weekly-note={n.id}>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: C.sub }}>
                <span className="font-medium" style={{ color: C.ink }}>
                  {n.name || "名前未設定"}
                </span>
                <span>{weekLabel(n.week)}</span>
              </div>
              <WeeklyLines note={n} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeeklyLines({ note }: { note: Pick<WeeklyNote, "done" | "next" | "trouble"> }) {
  return (
    <dl className="m-0 mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
      {note.done && (
        <>
          <dt style={{ color: C.sub }}>できたこと</dt>
          <dd className="m-0 whitespace-pre-wrap break-words">{note.done}</dd>
        </>
      )}
      {note.next && (
        <>
          <dt style={{ color: C.sub }}>次の一歩</dt>
          <dd className="m-0 whitespace-pre-wrap break-words">{note.next}</dd>
        </>
      )}
      {note.trouble && (
        <>
          <dt style={{ color: "#B42318" }}>困りごと</dt>
          <dd className="m-0 whitespace-pre-wrap break-words" data-gantt-weekly-trouble>
            {note.trouble}
          </dd>
        </>
      )}
    </dl>
  );
}

// ─── 今週のひとことの知らせを出す曜日（院長だけ） ───

export function WeekdaySetting() {
  const [day, setDay] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    ganttApi<{ reflectionWeekday: number }>("/api/gantt/settings")
      .then((j) => setDay(j.reflectionWeekday))
      .catch(() => setDay(null));
  }, []);
  if (day === null) return null;
  const save = async (d: number) => {
    setDay(d);
    setMsg("");
    try {
      await ganttApi("/api/gantt/settings", { method: "PUT", body: JSON.stringify({ reflectionWeekday: d }) });
      setMsg("保存しました");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存できませんでした");
    }
  };
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: C.sub }} data-gantt-weekday-setting>
      📝 今週のひとことの知らせを出す曜日（院長だけ）
      <select value={day} onChange={(e) => void save(Number(e.target.value))} className="min-h-[40px] rounded-full border bg-white px-3 text-[13px]" style={{ borderColor: BORDER, color: C.ink }} data-gantt-weekday>
        {WEEKDAY_LABELS.map((l, i) => (
          <option key={l} value={i}>
            {l}の朝
          </option>
        ))}
      </select>
      {msg && <span className="text-[12px]">{msg}</span>}
    </label>
  );
}

// ─── 🌅 朝礼サポートの「今週の計画」 ───

function MorningRow({ t }: { t: MorningTask }) {
  return (
    <li>
      <Link
        href={`/gantt?plan=${encodeURIComponent(t.planId)}&task=${encodeURIComponent(t.id)}`}
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-white"
        data-gantt-morning-task={t.id}
      >
        <span className="font-medium" style={{ color: C.ink }}>
          {t.title}
        </span>
        {t.directorJudge && <JudgeChip small />}
        {t.help && <HelpMark />}
        <span className="text-[12px]" style={{ color: C.sub }}>
          {t.planName}
          {t.due ? `・期限 ${shortDate(t.due)}` : ""}
          {t.assignees ? `・${t.assignees}` : ""}
          {t.cheers > 0 ? `・👏 ${t.cheers}` : ""}
        </span>
      </Link>
    </li>
  );
}

export function GanttMorning() {
  const [data, setData] = useState<MorningSummary | null>(null);
  useEffect(() => {
    // 年間計画を見られない人・朝礼サポートを見られない人は 404 → 何も出さない
    ganttApi<MorningSummary>("/api/gantt/morning")
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const block = (title: string, key: string, rows: MorningTask[], extra?: React.ReactNode) => (
    <div data-gantt-morning-block={key}>
      <h3 className="m-0 text-[13px] font-bold" style={{ color: C.statusText }}>
        {title}（{rows.length + (key === "last" ? data.lastWeekPlans.length : 0)}件）
      </h3>
      {extra}
      {rows.length > 0 && <ul className="m-0 mt-1 list-none space-y-0.5 p-0">{rows.map((t) => <MorningRow key={t.id} t={t} />)}</ul>}
      {rows.length === 0 && !(key === "last" && data.lastWeekPlans.length > 0) && (
        <p className="m-0 mt-0.5 text-[12px]" style={{ color: C.sub }}>
          ありません
        </p>
      )}
    </div>
  );
  return (
    <section
      className="space-y-3 rounded-[20px] p-4"
      style={{ background: "linear-gradient(160deg, #FDF8F6 0%, #FBEEF2 55%, #F3EEFA 100%)", border: C.cardBorder, color: C.ink }}
      aria-label="今週の計画"
      data-gantt-morning
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-bold">🏁 今週の計画</h2>
        <Link href="/gantt" className="text-[12px] underline" style={{ color: C.currentText }}>
          🏁 年間計画を開く
        </Link>
      </div>
      {block(`今週期限（${weekLabel(data.week)}）`, "week", data.weekDue)}
      {block("超過", "overdue", data.overdue)}
      {block(
        `先週完了（${weekLabel(data.lastWeek)}）`,
        "last",
        data.lastWeekTasks,
        data.lastWeekPlans.length > 0 && (
          <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
            {data.lastWeekPlans.map((p) => (
              <li key={p.id}>
                <Link href={`/gantt?plan=${encodeURIComponent(p.id)}`} className="flex flex-wrap items-center gap-x-2 rounded-xl px-2 py-1.5 text-[13px] hover:bg-white" data-gantt-morning-plan={p.id}>
                  <span className="font-medium">🎉 {p.name}</span>
                  {p.cheers > 0 && <span className="text-[12px]" style={{ color: C.sub }}>👏 {p.cheers}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
      {block("🙋 手伝ってほしい", "help", data.help)}
    </section>
  );
}

// ─── 可能性ノートの1on1タブ：最近のふりかえり ───

type ReflectionNote = WeeklyNote & { planName: string };

export function WeeklyReflections({ userId }: { userId?: string }) {
  const [notes, setNotes] = useState<ReflectionNote[] | null>(null);
  useEffect(() => {
    const q = userId ? `?user=${encodeURIComponent(userId)}` : "";
    fetch(`/api/growth/weekly${q}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { notes?: ReflectionNote[] } | null) => setNotes(j?.notes ?? null))
      .catch(() => setNotes(null));
  }, [userId]);
  if (!notes) return null;
  return (
    <section className="rounded-xl border border-rose-100 bg-white p-3 space-y-2" data-growth-weekly>
      <h2 className="text-sm font-medium text-gray-900">🏁 年間計画の今週のひとこと（最近4週間）</h2>
      {notes.length === 0 ? (
        <p className="text-[12px] text-gray-500">まだありません</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-rose-50/50 px-3 py-2 text-[12px]" data-growth-weekly-note={n.id}>
              <div className="flex flex-wrap gap-x-2 text-[11px] text-gray-500">
                <span className="font-medium text-gray-800">{n.planName}</span>
                <span>{weekLabel(n.week)}</span>
                <span>{timeLabel(n.at)}</span>
              </div>
              <WeeklyLines note={n} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
