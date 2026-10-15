"use client";

// 📜 当院の歩みの画面（指示書253・見た目は250-補「さくらミルク（グラデーション）」）
//
// ・入口：コーポレートデザインブックの「創業の歴史・精神」（コアメッセージ・コアヒストリー）。1字も変えずに出す。
//   【P.30】は院長が書き足すまでスタッフには出さない（院長には「ここに書き足す」と出す）。直せるのは院長だけ
// ・年表：縦の線（グラデーション）と年ごとの見出し。古い順が既定（新しい順にも）。理念とのつながり・分類・年で絞り込む
// ・カード：日付・題名・理念とのつながりの札・写真1枚・込めた想い・学びのはじめの数行。押すと全部の項目
// ・書く人（院長・任された幹部）：＋ 追加・直す・消す・写真・ガントチャートからの候補（残す／候補から外す）
// ・関わった人の声：「関わった人」に選ばれた本人だけが自分のひとこと（200字まで）を書く・直す・消す
// ・判定はすべてサーバー（/api/ayumi・/api/ayumi/voice・/api/ayumi/photos）。画面は返ってきた権限に従うだけ

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePageTitle } from "@/lib/use-nav";
import { C, FONT_HREF } from "@/components/gantt/sakura-theme";
import { GANTT_PALETTES, STATUS_LABEL, categoryOf, grad, periodLabel, type GanttCategory, type TaskStatus } from "@/lib/gantt";
import {
  DEFAULT_CORE_MESSAGES,
  DEFAULT_HISTORY_AFTER,
  DEFAULT_HISTORY_BEFORE,
  INTRO_SOURCE,
} from "@/lib/ayumi-intro-text";
import {
  LONG_TEXT_MAX,
  OTHER_PEOPLE_MAX,
  TEAM_NAME_MAX,
  TITLE_MAX,
  VALUE_GROUPS,
  VOICE_MAX,
  excerpt,
  filterEntries,
  groupByYear,
  isFlexDate,
  periodText,
  sortEntries,
  yearOf,
  type AyumiEntry,
  type AyumiIntro,
  type AyumiPerson,
  type AyumiVoice,
  type EntryFields,
} from "@/lib/ayumi";
import { jstTodayYmd } from "@/lib/library";
import { removeAyumiPhoto, uploadAyumiPhoto } from "@/lib/ayumi-client";

type Candidate = { id: string; name: string; start: string; end: string; status: TaskStatus; categoryId: string; kind: string };

type AyumiData = {
  intro: AyumiIntro;
  entries: AyumiEntry[];
  voices: AyumiVoice[];
  categories: GanttCategory[];
  canWrite: boolean;
  canEditIntro: boolean;
  me: string;
  people: AyumiPerson[];
  candidates: Candidate[];
};

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error("通信できませんでした。電波・接続を確かめてもう一度お試しください");
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `処理に失敗しました (${res.status})`);
  return j;
}

const line = "rgba(240, 209, 218, 0.9)";
const card = { background: C.cardBg, border: C.cardBorder, boxShadow: C.cardShadow };
const field = "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
const fieldStyle = { borderColor: line, color: C.ink };
const lab = "block text-[12px] font-medium";

function ValueChip({ word }: { word: string }) {
  return (
    <span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] leading-none" style={{ background: C.statusChip, color: C.statusText }}>
      {word}
    </span>
  );
}

function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className={`whitespace-pre-wrap ${className}`}>
            {p}
          </p>
        ))}
    </>
  );
}

function Modal({ label, onClose, children, wide = false, dataKey }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean; dataKey: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 sm:items-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={label}
        data-ayumi-modal={dataKey}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] sm:rounded-[24px] ${wide ? "sm:max-w-[720px]" : "sm:max-w-[560px]"}`}
        style={{ background: "#FFFFFF", fontFamily: C.sans, color: C.ink, boxShadow: "0 20px 44px rgba(142, 91, 181, 0.18)" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── 入口「創業の歴史・精神」 ───

function IntroSection({ intro, canEdit, onSaved }: { intro: AyumiIntro; canEdit: boolean; onSaved: (i: AyumiIntro) => void }) {
  const messages = intro.messages ?? [...DEFAULT_CORE_MESSAGES];
  const before = intro.before ?? DEFAULT_HISTORY_BEFORE;
  const after = intro.after ?? DEFAULT_HISTORY_AFTER;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ messages: messages.join("\n"), before, p30: intro.p30, after });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const msgs = draft.messages.split("\n").map((m) => m.trim()).filter(Boolean);
      const same = (a: string, b: string) => a === b;
      const j = await api<{ intro: AyumiIntro }>("/api/ayumi", {
        method: "PUT",
        body: JSON.stringify({
          intro: {
            // 元の文と同じなら「元の文」のまま（null）にしておく＝元の文が直ったときに追いつく
            messages: msgs.join("\n") === DEFAULT_CORE_MESSAGES.join("\n") ? null : msgs,
            before: same(draft.before, DEFAULT_HISTORY_BEFORE) ? null : draft.before,
            after: same(draft.after, DEFAULT_HISTORY_AFTER) ? null : draft.after,
            p30: draft.p30,
          },
        }),
      });
      onSaved(j.intro);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[28px] px-5 py-6 md:px-8" style={card} data-ayumi-intro>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[22px] font-bold tracking-[0.04em]" style={{ fontFamily: C.serif }}>
          創業の歴史・精神
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft({ messages: messages.join("\n"), before, p30: intro.p30, after });
              setEditing(true);
            }}
            className="min-h-[36px] rounded-full border px-4 text-[13px]"
            style={{ borderColor: line, color: C.statusText, background: "#FFFFFF" }}
            data-ayumi-intro-edit
          >
            直す
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3" data-ayumi-intro-form>
          <label className={lab} style={{ color: C.sub }}>
            コアメッセージ（1行に1つ）
            <textarea value={draft.messages} rows={5} onChange={(e) => setDraft({ ...draft, messages: e.target.value })} className={field} style={fieldStyle} />
          </label>
          <label className={lab} style={{ color: C.sub }}>
            コアヒストリー（P.30 の前まで）
            <textarea value={draft.before} rows={10} onChange={(e) => setDraft({ ...draft, before: e.target.value })} className={field} style={fieldStyle} />
          </label>
          <label className={lab} style={{ color: C.sub }}>
            【P.30】原本から書き足す（空のあいだはスタッフに出しません）
            <textarea value={draft.p30} rows={6} onChange={(e) => setDraft({ ...draft, p30: e.target.value })} className={field} style={fieldStyle} data-ayumi-intro-p30 />
          </label>
          <label className={lab} style={{ color: C.sub }}>
            コアヒストリー（P.31 から）
            <textarea value={draft.after} rows={10} onChange={(e) => setDraft({ ...draft, after: e.target.value })} className={field} style={fieldStyle} />
          </label>
          {err && <p role="alert" className="text-[13px]" style={{ color: C.statusText }}>{err}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] rounded-full border px-5 text-[14px]" style={{ borderColor: line, color: C.sub }}>
              閉じる
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-ayumi-intro-save>
              {busy ? "保存しています…" : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="mb-2 mt-5 text-[13px] font-bold tracking-[0.08em]" style={{ color: C.currentText }}>
            コアメッセージ
          </h3>
          <ul className="m-0 list-none space-y-1.5 p-0" data-ayumi-core-messages>
            {messages.map((m, i) => (
              <li key={i} className="text-[16px] font-bold md:text-[18px]" style={{ fontFamily: C.serif }}>
                {m}
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-6 text-[13px] font-bold tracking-[0.08em]" style={{ color: C.currentText }}>
            コアヒストリー
          </h3>
          <div className={`relative space-y-3 text-[14px] leading-[1.95] ${open ? "" : "max-h-[260px] overflow-hidden"}`} data-ayumi-history>
            <Paragraphs text={before} />
            {intro.p30.trim() ? (
              <Paragraphs text={intro.p30} />
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setDraft({ messages: messages.join("\n"), before, p30: intro.p30, after });
                  setEditing(true);
                  setOpen(true);
                }}
                className="block w-full rounded-2xl border-2 border-dashed px-4 py-3 text-left text-[13px]"
                style={{ borderColor: "#E8C35A", color: "#86650F", background: "rgba(253, 240, 200, 0.4)" }}
                data-ayumi-p30-placeholder
              >
                【P.30】ここに書き足す（原本のP.30の文。書き足すまで、スタッフには出ません）
              </button>
            ) : null}
            <Paragraphs text={after} />
            {!open && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, #FFFFFF 90%)" }} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-[40px] text-[13px] underline" style={{ color: C.currentText }} aria-expanded={open} data-ayumi-history-toggle>
              {open ? "閉じる" : "続きを読む"}
            </button>
            <span className="text-[11px]" style={{ color: C.sub }} data-ayumi-source>
              {INTRO_SOURCE}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

// ─── 日付の欄（年・年月・年月日のどれでもよい） ───

function FlexDateInput({ value, onChange, label, dataKey }: { value: string; onChange: (v: string) => void; label: string; dataKey: string }) {
  const [y, m, d] = [value.slice(0, 4), value.slice(5, 7), value.slice(8, 10)];
  const set = (ny: string, nm: string, nd: string) => onChange(!ny ? "" : `${ny}${nm ? `-${nm}${nd ? `-${nd}` : ""}` : ""}`);
  const days = y && m ? new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate() : 31;
  return (
    <fieldset className="min-w-0" data-ayumi-date={dataKey}>
      <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
        {label}
      </legend>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={y}
          placeholder="年"
          aria-label={`${label}の年`}
          onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 4), m, d)}
          className="w-[76px] rounded-xl border bg-white px-2 py-2 text-[14px]"
          style={fieldStyle}
          data-ayumi-date-y
        />
        <span className="text-[12px]">年</span>
        <select value={m} onChange={(e) => set(y, e.target.value, e.target.value ? d : "")} aria-label={`${label}の月`} className="rounded-xl border bg-white px-1.5 py-2 text-[14px]" style={fieldStyle} data-ayumi-date-m>
          <option value="">—</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((v) => (
            <option key={v} value={v}>
              {Number(v)}
            </option>
          ))}
        </select>
        <span className="text-[12px]">月</span>
        <select value={d} disabled={!m} onChange={(e) => set(y, m, e.target.value)} aria-label={`${label}の日`} className="rounded-xl border bg-white px-1.5 py-2 text-[14px] disabled:opacity-50" style={fieldStyle} data-ayumi-date-d>
          <option value="">—</option>
          {Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")).map((v) => (
            <option key={v} value={v}>
              {Number(v)}
            </option>
          ))}
        </select>
        <span className="text-[12px]">日</span>
      </div>
    </fieldset>
  );
}

// ─── 足す・直す ───

type Draft = Required<Omit<EntryFields, "people">> & { peopleIds: string[]; period: boolean };

function draftOf(e: AyumiEntry | null): Draft {
  return {
    title: e?.title ?? "",
    dateFrom: e?.dateFrom ?? "",
    dateTo: e?.dateTo ?? "",
    period: !!e?.dateTo,
    categoryId: e?.categoryId ?? "",
    thoughts: e?.thoughts ?? "",
    outcome: e?.outcome ?? "",
    message: e?.message ?? "",
    values: e?.values ?? [],
    teamName: e?.teamName ?? "",
    peopleIds: (e?.people ?? []).map((p) => p.id),
    otherPeople: e?.otherPeople ?? "",
  };
}

function EntryForm({
  entry,
  categories,
  people,
  busy,
  error,
  onSave,
  onClose,
}: {
  entry: AyumiEntry | null;
  categories: GanttCategory[];
  people: AyumiPerson[];
  busy: boolean;
  error: string;
  onSave: (d: Draft) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(entry));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const choices = [...people, ...(entry?.people ?? []).filter((p) => !people.some((x) => x.id === p.id))];
  const missing = !d.title.trim()
    ? "題名を入れてください"
    : !isFlexDate(d.dateFrom)
      ? "日付を入れてください（年だけでもかまいません）"
      : d.period && d.dateTo && !isFlexDate(d.dateTo)
        ? "終わりの日付を正しく入れてください"
        : "";
  const toggleValue = (w: string) => set("values", d.values.includes(w) ? d.values.filter((x) => x !== w) : [...d.values, w]);
  const togglePerson = (id: string) => set("peopleIds", d.peopleIds.includes(id) ? d.peopleIds.filter((x) => x !== id) : [...d.peopleIds, id]);

  return (
    <Modal label={entry ? "当院の歩みを直す" : "当院の歩みに追加"} onClose={onClose} dataKey="form" wide>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !busy) onSave(d);
        }}
        data-ayumi-form
      >
        <h2 className="mb-3 text-[18px] font-bold" style={{ fontFamily: C.serif }}>
          {entry ? "直す" : "＋ 追加"}
        </h2>
        <div className="space-y-3">
          <label className={lab} style={{ color: C.sub }}>
            題名
            <input type="text" value={d.title} maxLength={TITLE_MAX} onChange={(e) => set("title", e.target.value)} className={field} style={fieldStyle} data-ayumi-f-title />
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <FlexDateInput value={d.dateFrom} onChange={(v) => set("dateFrom", v)} label={d.period ? "日付（はじめ）" : "日付"} dataKey="from" />
            {d.period && <FlexDateInput value={d.dateTo} onChange={(v) => set("dateTo", v)} label="日付（おわり）" dataKey="to" />}
          </div>
          <label className="flex min-h-[40px] items-center gap-2 text-[13px]">
            <input type="checkbox" checked={d.period} onChange={(e) => setD((p) => ({ ...p, period: e.target.checked, dateTo: e.target.checked ? p.dateTo : "" }))} className="h-4 w-4" data-ayumi-f-period />
            期間（はじめ〜おわり）にする
          </label>
          <p className="-mt-2 text-[11px]" style={{ color: C.sub }}>
            年だけ・年と月だけでもかまいません（昔の出来事など）
          </p>
          <label className={lab} style={{ color: C.sub }}>
            分類（任意）
            <select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={field} style={fieldStyle} data-ayumi-f-category>
              <option value="">なし</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["thoughts", "込めた想い・学び"],
              ["outcome", "成果・変化"],
              ["message", "新しく入る人へのひとこと"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={lab} style={{ color: C.sub }}>
              {label}
              <textarea value={d[k]} rows={4} maxLength={LONG_TEXT_MAX} onChange={(e) => set(k, e.target.value)} className={field} style={fieldStyle} data-ayumi-f={k} />
            </label>
          ))}
          <fieldset data-ayumi-f-values>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              理念とのつながり（いくつでも）
            </legend>
            {VALUE_GROUPS.map((g) => (
              <div key={g.label} className="mt-1.5">
                <p className="text-[11px]" style={{ color: C.sub }}>
                  {g.label}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.words.map((w) => {
                    const on = d.values.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleValue(w)}
                        className="min-h-[38px] rounded-full border px-3 text-[13px]"
                        style={{ borderColor: on ? "#E7A6B8" : line, background: on ? C.statusChip : "#FFFFFF", color: on ? C.statusText : C.ink, fontWeight: on ? 700 : 400 }}
                        data-ayumi-f-value={w}
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
          <fieldset className="space-y-2" data-ayumi-f-people>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              関わった人（チーム・メンバー）
            </legend>
            <input type="text" value={d.teamName} maxLength={TEAM_NAME_MAX} placeholder="チーム名（任意）" aria-label="チーム名" onChange={(e) => set("teamName", e.target.value)} className={field} style={fieldStyle} data-ayumi-f-team />
            <div className="flex max-h-[160px] flex-wrap gap-1.5 overflow-y-auto">
              {choices.map((p) => {
                const on = d.peopleIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePerson(p.id)}
                    className="min-h-[38px] rounded-full border px-3 text-[13px]"
                    style={{ borderColor: on ? "#E8C35A" : line, background: on ? "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)" : "#FFFFFF", color: on ? "#86650F" : C.ink, fontWeight: on ? 700 : 400 }}
                    data-ayumi-f-person={p.id}
                  >
                    {on ? "✓ " : ""}
                    {p.name || "名前未設定"}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px]" style={{ color: C.sub }}>
              選んだスタッフは、自分のひとこと（関わった人の声）を書けます
            </p>
            <input type="text" value={d.otherPeople} maxLength={OTHER_PEOPLE_MAX} placeholder="もう在籍していない人など（文字で）" aria-label="もう在籍していない人など" onChange={(e) => set("otherPeople", e.target.value)} className={field} style={fieldStyle} data-ayumi-f-others />
          </fieldset>
          {!entry && (
            <p className="text-[12px]" style={{ color: C.sub }}>
              写真は、保存したあと、くわしい内容の「＋ 写真を足す」から貼れます
            </p>
          )}
        </div>
        {(error || missing) && (
          <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} data-ayumi-f-error>
            {error || missing}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-full border px-5 text-[14px]" style={{ borderColor: line, color: C.sub }}>
            閉じる
          </button>
          <button type="submit" disabled={!!missing || busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-ayumi-f-save>
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── くわしい内容 ───

function EntryDetail({
  entry,
  category,
  voices,
  me,
  canWrite,
  onEdit,
  onDelete,
  onChanged,
  onVoicesChanged,
  onClose,
}: {
  entry: AyumiEntry;
  category: GanttCategory | null;
  voices: AyumiVoice[];
  me: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: (e: AyumiEntry) => void;
  onVoicesChanged: () => void;
  onClose: () => void;
}) {
  const [big, setBig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = voices.find((v) => v.userId === me);
  const canVoice = entry.people.some((p) => p.id === me);
  const [voiceText, setVoiceText] = useState(mine?.text ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      let cur = entry;
      for (const f of Array.from(files)) cur = await uploadAyumiPhoto(entry.id, f);
      onChanged(cur);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を貼れませんでした");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removePhoto = async (path: string) => {
    if (!window.confirm("この写真を外します。\n\nよろしいですか？")) return;
    setBusy(true);
    setErr("");
    try {
      onChanged(await removeAyumiPhoto(entry.id, path));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "外せませんでした");
    } finally {
      setBusy(false);
    }
  };
  const saveVoice = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/ayumi/voice", { method: "PUT", body: JSON.stringify({ entryId: entry.id, text: voiceText }) });
      onVoicesChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };
  const deleteVoice = async (userId: string) => {
    if (!window.confirm("このひとことを消します。\n\nよろしいですか？")) return;
    setBusy(true);
    setErr("");
    try {
      await api("/api/ayumi/voice", { method: "DELETE", body: JSON.stringify({ entryId: entry.id, userId }) });
      if (userId === me) setVoiceText("");
      onVoicesChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "消せませんでした");
    } finally {
      setBusy(false);
    }
  };

  const section = (title: string, body: string, key: string) =>
    body.trim() ? (
      <section data-ayumi-d={key}>
        <h3 className="mb-1 text-[12px] font-bold tracking-[0.06em]" style={{ color: C.currentText }}>
          {title}
        </h3>
        <p className="m-0 whitespace-pre-wrap break-words text-[14px] leading-[1.9]">{body}</p>
      </section>
    ) : null;

  return (
    <Modal label={`${entry.title} のくわしい内容`} onClose={onClose} dataKey="detail" wide>
      <div className="px-5 pb-3 pt-5" style={{ background: C.detailHead }}>
        <p className="m-0 text-[12px]" style={{ color: C.sub }} data-ayumi-d-date>
          {periodText(entry.dateFrom, entry.dateTo)}
          {category && <span className="ml-2">・{category.name}</span>}
          {entry.source && <span className="ml-2" data-ayumi-from-gantt>📊 ガントチャートから</span>}
        </p>
        <h2 className="m-0 mt-1 text-[20px] font-bold" style={{ fontFamily: C.serif }}>
          {entry.title}
        </h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        {section("込めた想い・学び", entry.thoughts, "thoughts")}
        {section("成果・変化", entry.outcome, "outcome")}
        {section("新しく入る人へのひとこと", entry.message, "message")}
        {entry.values.length > 0 && (
          <section data-ayumi-d="values">
            <h3 className="mb-1 text-[12px] font-bold tracking-[0.06em]" style={{ color: C.currentText }}>
              理念とのつながり
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {entry.values.map((w) => (
                <ValueChip key={w} word={w} />
              ))}
            </div>
          </section>
        )}
        {(entry.photos.length > 0 || canWrite) && (
          <section data-ayumi-d="photos">
            <h3 className="mb-1 text-[12px] font-bold tracking-[0.06em]" style={{ color: C.currentText }}>
              写真
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {entry.photos.map((p) => (
                <div key={p.path} className="relative">
                  <button type="button" onClick={() => setBig(p.url || null)} className="block aspect-square w-full overflow-hidden rounded-xl bg-[#F6EEF1]" aria-label={`写真を大きく見る（${p.name}）`} data-ayumi-photo={p.path}>
                    {p.url && <img src={p.url} alt={p.name} className="h-full w-full object-cover" />}
                  </button>
                  {canWrite && (
                    <button type="button" onClick={() => void removePhoto(p.path)} className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-[11px]" style={{ color: C.statusText }} aria-label="この写真を外す">
                      外す
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files)} data-ayumi-photo-input />
                <button type="button" disabled={busy || entry.photos.length >= 10} onClick={() => fileRef.current?.click()} className="mt-2 min-h-[40px] rounded-full border px-4 text-[13px] disabled:opacity-50" style={{ borderColor: line, color: C.statusText }} data-ayumi-photo-add>
                  {busy ? "保存しています…" : "＋ 写真を足す"}
                </button>
                <p className="mt-1 text-[11px]" style={{ color: C.sub }}>
                  1枚10MBまで・10枚まで。写真の位置情報などは消してから保存します。iPhoneの写真（HEIC）も表示できる形にします。
                </p>
              </>
            )}
          </section>
        )}
        {(entry.teamName || entry.people.length > 0 || entry.otherPeople) && (
          <section data-ayumi-d="people">
            <h3 className="mb-1 text-[12px] font-bold tracking-[0.06em]" style={{ color: C.currentText }}>
              関わった人
            </h3>
            {entry.teamName && <p className="m-0 text-[14px] font-medium">{entry.teamName}</p>}
            <p className="m-0 text-[14px]">{[...entry.people.map((p) => p.name || "名前未設定"), entry.otherPeople.trim()].filter(Boolean).join("、")}</p>
          </section>
        )}
        <section data-ayumi-d="voices">
          <h3 className="mb-1 text-[12px] font-bold tracking-[0.06em]" style={{ color: C.currentText }}>
            関わった人の声
          </h3>
          {voices.length === 0 && !canVoice && <p className="m-0 text-[13px]" style={{ color: C.sub }}>まだありません</p>}
          <ul className="m-0 list-none space-y-2 p-0">
            {voices.map((v) => (
              <li key={v.userId} className="rounded-2xl px-3 py-2" style={{ background: "#FBF5F8" }} data-ayumi-voice={v.userId}>
                <p className="m-0 whitespace-pre-wrap break-words text-[14px]">{v.text}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[12px]" style={{ color: C.sub }}>— {v.name || "名前未設定"}</span>
                  {(canWrite || v.userId === me) && (
                    <button type="button" onClick={() => void deleteVoice(v.userId)} className="text-[12px] underline" style={{ color: C.statusText }} data-ayumi-voice-delete={v.userId}>
                      消す
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {canVoice && (
            <div className="mt-2" data-ayumi-my-voice>
              <label className={lab} style={{ color: C.sub }}>
                {mine ? "わたしのひとことを直す" : "わたしのひとこと"}（{VOICE_MAX}字まで）
                <textarea value={voiceText} rows={3} maxLength={VOICE_MAX} onChange={(e) => setVoiceText(e.target.value)} className={field} style={fieldStyle} data-ayumi-voice-text />
              </label>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: C.sub }}>
                  {voiceText.length}／{VOICE_MAX}
                </span>
                <button type="button" onClick={() => void saveVoice()} disabled={busy || !voiceText.trim()} className="min-h-[40px] rounded-full px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-ayumi-voice-save>
                  {busy ? "保存しています…" : "保存"}
                </button>
              </div>
            </div>
          )}
        </section>
        {err && <p role="alert" className="rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }}>{err}</p>}
      </div>
      <div className="flex justify-end gap-2 px-5 pb-5">
        {canWrite && (
          <>
            <button type="button" onClick={onEdit} className="min-h-[40px] rounded-full px-4 text-[13px] font-bold text-white" style={{ background: C.hero, boxShadow: C.heroShadow }} data-ayumi-edit>
              直す
            </button>
            <button type="button" onClick={onDelete} className="min-h-[40px] rounded-full border px-4 text-[13px]" style={{ borderColor: line, color: C.statusText, background: "#FFFFFF" }} data-ayumi-delete>
              消す
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className="min-h-[40px] rounded-full border px-4 text-[13px]" style={{ borderColor: line, color: C.sub, background: "#FFFFFF" }} data-ayumi-detail-close>
          閉じる
        </button>
      </div>
      {big &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)} data-ayumi-photo-big>
            <img src={big} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          </div>,
          document.body
        )}
    </Modal>
  );
}

// ─── 本体 ───

export function AyumiBoard() {
  const today = jstTodayYmd();
  const pageTitle = usePageTitle("/ayumi", "📜 当院の歩み").replace(/^\p{Extended_Pictographic}️?\s*/u, "");
  const [data, setData] = useState<AyumiData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [order, setOrder] = useState<"old" | "new">("old");
  const [filter, setFilter] = useState({ value: "", categoryId: "", year: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ entry: AyumiEntry | null } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyPlan, setBusyPlan] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<AyumiData>("/api/ayumi"));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const entries = useMemo(() => sortEntries(filterEntries(data?.entries ?? [], filter), order), [data, filter, order]);
  const years = useMemo(() => [...new Set((data?.entries ?? []).map((e) => yearOf(e.dateFrom)))].sort(), [data]);
  const groups = useMemo(() => groupByYear(entries), [entries]);
  const opened = openId ? data?.entries.find((e) => e.id === openId) ?? null : null;
  const canWrite = !!data?.canWrite;

  const saveEntry = async (d: Draft) => {
    if (!form) return;
    setFormBusy(true);
    setFormError("");
    const fields = {
      title: d.title.trim(),
      dateFrom: d.dateFrom,
      dateTo: d.period ? d.dateTo : "",
      categoryId: d.categoryId,
      thoughts: d.thoughts,
      outcome: d.outcome,
      message: d.message,
      values: d.values,
      teamName: d.teamName,
      people: d.peopleIds,
      otherPeople: d.otherPeople,
    };
    try {
      const j = form.entry
        ? await api<{ entry: AyumiEntry }>("/api/ayumi", { method: "PATCH", body: JSON.stringify({ id: form.entry.id, fields }) })
        : await api<{ entry: AyumiEntry }>("/api/ayumi", { method: "POST", body: JSON.stringify({ fields }) });
      setForm(null);
      setNotice(form.entry ? "直しました" : "追加しました");
      await load();
      setOpenId(j.entry.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setFormBusy(false);
    }
  };

  const removeEntry = async (e: AyumiEntry) => {
    if (!window.confirm(`「${e.title}」を消します。写真と関わった人の声も一緒に消えます。\n\nよろしいですか？`)) return;
    setActionError("");
    try {
      await api(`/api/ayumi?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
      setOpenId(null);
      setNotice("消しました");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "消せませんでした");
    }
  };

  const keepCandidate = async (c: Candidate) => {
    setBusyPlan(c.id);
    setActionError("");
    try {
      const j = await api<{ entry: AyumiEntry }>("/api/ayumi", { method: "POST", body: JSON.stringify({ fromPlanId: c.id }) });
      setNotice(`「${c.name}」を当院の歩みに残しました。想いなどを書き足してください`);
      await load();
      setOpenId(j.entry.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "残せませんでした");
    } finally {
      setBusyPlan("");
    }
  };
  const dismissCandidate = async (c: Candidate) => {
    setBusyPlan(c.id);
    setActionError("");
    try {
      await api("/api/ayumi", { method: "POST", body: JSON.stringify({ op: "dismiss", planId: c.id }) });
      setData((d) => (d ? { ...d, candidates: d.candidates.filter((x) => x.id !== c.id) } : d));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "外せませんでした");
    } finally {
      setBusyPlan("");
    }
  };

  const pill = { background: C.pillBg, border: C.pillBorder, boxShadow: C.pillShadow };
  const sel = "min-h-[44px] rounded-full border bg-white/80 px-3 text-[13px]";

  return (
    <div className="-mx-4 -my-4 px-4 py-6 md:-mx-8 md:-my-8 md:px-6 md:py-10" style={{ background: C.bg, fontFamily: C.sans, color: C.ink, minHeight: "100%" }} data-ayumi-page>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      <div className="mx-auto flex max-w-[960px] flex-col gap-5">
        {/* 題 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[15px] text-[22px]" style={{ background: "linear-gradient(135deg, #F9D3DD 0%, #E6DAF7 100%)", boxShadow: "0 6px 16px rgba(180, 83, 106, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.8)" }} aria-hidden="true">
              📜
            </span>
            <h1 className="m-0 text-[26px] font-bold tracking-[0.04em] md:text-[32px]" style={{ fontFamily: C.serif }} data-ayumi-title>
              {pageTitle}
            </h1>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setFormError("");
                setForm({ entry: null });
              }}
              className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white"
              style={{ background: C.hero, boxShadow: C.heroShadow }}
              data-ayumi-add
            >
              ＋ 追加
            </button>
          )}
        </div>

        {data && <IntroSection intro={data.intro} canEdit={data.canEditIntro} onSaved={(intro) => setData((d) => (d ? { ...d, intro } : d))} />}

        {notice && (
          <p className="rounded-2xl px-4 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.8)", color: "#337559" }} role="status" data-ayumi-notice>
            {notice}
          </p>
        )}
        {(actionError || loadError) && (
          <p className="rounded-2xl px-4 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} role="alert" data-ayumi-error>
            {actionError || loadError}
          </p>
        )}

        {/* 候補（書く人だけ） */}
        {canWrite && (data?.candidates.length ?? 0) > 0 && (
          <section className="rounded-[28px] p-5" style={card} data-ayumi-candidates>
            <h2 className="m-0 text-[16px] font-bold" style={{ fontFamily: C.serif }}>
              候補（📊 ガントチャートで終わった計画）
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: C.sub }}>
              完了になった計画と、期間が終わった計画です。残すと、題名・期間・分類（チームプロジェクトはチーム名とメンバーも）を写します。
            </p>
            <ul className="m-0 mt-3 list-none space-y-2 p-0">
              {data!.candidates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/80 px-3 py-2" data-ayumi-candidate={c.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{c.name}</span>
                    <span className="block text-[12px]" style={{ color: C.sub }}>
                      {periodLabel(c.start, c.end, today)}・{STATUS_LABEL[c.status]}
                      {categories.find((x) => x.id === c.categoryId) ? `・${categoryOf(categories, c.categoryId).name}` : ""}
                    </span>
                  </span>
                  <button type="button" disabled={busyPlan === c.id} onClick={() => void keepCandidate(c)} className="min-h-[40px] rounded-full px-4 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.hero }} data-ayumi-keep={c.id}>
                    📜 当院の歩みに残す
                  </button>
                  <button type="button" disabled={busyPlan === c.id} onClick={() => void dismissCandidate(c)} className="min-h-[40px] rounded-full border bg-white px-3 text-[13px] disabled:opacity-50" style={{ borderColor: line, color: C.sub }} data-ayumi-dismiss={c.id}>
                    候補から外す
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 並び・絞り込み */}
        <div className="flex flex-wrap items-center gap-2" data-ayumi-toolbar>
          <div role="group" aria-label="並び" className="flex rounded-full p-1" style={pill}>
            {(["old", "new"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={order === o}
                onClick={() => setOrder(o)}
                className="min-h-[40px] w-[84px] rounded-full text-[13px]"
                style={{ background: order === o ? C.hero : "transparent", color: order === o ? "#FFFFFF" : C.sub, fontWeight: order === o ? 700 : 400 }}
                data-ayumi-order={o}
              >
                {o === "old" ? "古い順" : "新しい順"}
              </button>
            ))}
          </div>
          <select value={filter.value} onChange={(e) => setFilter({ ...filter, value: e.target.value })} className={sel} style={{ borderColor: line }} aria-label="理念とのつながりで絞り込む" data-ayumi-filter-value>
            <option value="">理念とのつながり：すべて</option>
            {VALUE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.words.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select value={filter.categoryId} onChange={(e) => setFilter({ ...filter, categoryId: e.target.value })} className={sel} style={{ borderColor: line }} aria-label="分類で絞り込む" data-ayumi-filter-category>
            <option value="">分類：すべて</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filter.year} onChange={(e) => setFilter({ ...filter, year: e.target.value })} className={sel} style={{ borderColor: line }} aria-label="年で絞り込む" data-ayumi-filter-year>
            <option value="">年：すべて</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {Number(y)}年
              </option>
            ))}
          </select>
        </div>

        {/* 年表 */}
        <section className="relative" data-ayumi-timeline>
          {!data && !loadError && (
            <p className="py-10 text-center text-[14px]" style={{ color: C.sub }}>
              読み込んでいます…
            </p>
          )}
          {data && groups.length === 0 && (
            <p className="rounded-[28px] py-10 text-center text-[14px]" style={{ ...card, color: C.sub }} data-ayumi-empty>
              {data.entries.length ? "選んだ条件の出来事はありません" : canWrite ? "まだ出来事はありません。「＋ 追加」や候補から残せます" : "まだ出来事はありません"}
            </p>
          )}
          {groups.length > 0 && (
            <div className="relative pl-7 md:pl-10">
              {/* 縦の線（グラデーション） */}
              <div aria-hidden="true" className="absolute bottom-2 left-[11px] top-2 w-[3px] rounded-full md:left-[17px]" style={{ background: C.todayLine }} data-ayumi-line />
              {groups.map((g) => (
                <div key={g.year} className="mb-6" data-ayumi-year={g.year}>
                  <h2 className="relative m-0 mb-3 text-[22px] font-bold" style={{ fontFamily: C.serif, color: C.currentText }}>
                    <span aria-hidden="true" className="absolute -left-[23px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full md:-left-[29px]" style={{ background: C.hero, boxShadow: "0 0 0 4px #FCE8EE" }} />
                    {Number(g.year)}年
                  </h2>
                  <ul className="m-0 list-none space-y-3 p-0">
                    {g.entries.map((e) => {
                      const cat = e.categoryId ? categories.find((c) => c.id === e.categoryId) ?? null : null;
                      const photo = e.photos[0];
                      return (
                        <li key={e.id} className="relative">
                          <span aria-hidden="true" className="absolute -left-[20px] top-6 h-[9px] w-[9px] rounded-full md:-left-[26px]" style={{ background: cat ? grad(GANTT_PALETTES[cat.color].dot, 135) : "#D9B9EE" }} />
                          <button
                            type="button"
                            onClick={() => setOpenId(e.id)}
                            className="flex w-full gap-3 rounded-[20px] p-4 text-left transition-shadow hover:shadow-lg"
                            style={card}
                            data-ayumi-card={e.id}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12px]" style={{ color: C.sub }}>
                                {periodText(e.dateFrom, e.dateTo)}
                                {cat && <span className="ml-1.5" style={{ color: GANTT_PALETTES[cat.color].text }}>・{cat.name}</span>}
                                {e.source && <span className="ml-1.5" title="ガントチャートから">📊</span>}
                              </span>
                              <span className="mt-0.5 block text-[16px] font-bold leading-snug md:text-[17px]" style={{ fontFamily: C.serif }}>
                                {e.title}
                              </span>
                              {e.values.length > 0 && (
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                  {e.values.map((w) => (
                                    <ValueChip key={w} word={w} />
                                  ))}
                                </span>
                              )}
                              {e.thoughts.trim() && (
                                <span className="mt-2 block whitespace-pre-wrap break-words text-[13px] leading-[1.8]" style={{ color: C.sub }} data-ayumi-excerpt>
                                  {excerpt(e.thoughts)}
                                </span>
                              )}
                            </span>
                            {photo?.url && (
                              <span className="block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-2xl bg-[#F6EEF1] md:h-[110px] md:w-[110px]">
                                <img src={photo.url} alt="" className="h-full w-full object-cover" data-ayumi-thumb />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {opened && data && (
        <EntryDetail
          key={opened.id + opened.updatedAt}
          entry={opened}
          category={opened.categoryId ? categories.find((c) => c.id === opened.categoryId) ?? null : null}
          voices={data.voices.filter((v) => v.entryId === opened.id)}
          me={data.me}
          canWrite={canWrite}
          onEdit={() => {
            setFormError("");
            setForm({ entry: opened });
          }}
          onDelete={() => void removeEntry(opened)}
          onChanged={(e) => setData((d) => (d ? { ...d, entries: d.entries.map((x) => (x.id === e.id ? e : x)) } : d))}
          onVoicesChanged={() => void load()}
          onClose={() => setOpenId(null)}
        />
      )}
      {form && data && (
        <EntryForm entry={form.entry} categories={categories} people={data.people} busy={formBusy} error={formError} onSave={(d) => void saveEntry(d)} onClose={() => setForm(null)} />
      )}
    </div>
  );
}
