"use client";

// 1on1の書き起こしを取り込み、AIのまとめと記録欄の下書きを作る（指示書221）
//
// 【原文を残さない（221 §5）】貼り付けた書き起こしは**この部品の中（Reactの状態）だけ**で持ち、
//   AIに送ったあとに捨てる。下書きの保存（useDraft＝sessionStorage）は**使わない**。
//   保存されるのは、記録欄とまとめだけ（原文は入れない）。
//
// 【流れ（221 §2）】スタッフ・実施日・形式を決める → 貼り付け/ファイル → AIで整理する →
//   確かめて直す（直すと「AIの下書き」の印が消える） → 保存。
//
// 【保存の口】既存の1on1ノートと同じ（private_store の content_type "one_on_one"）。
//   見られる人・約束のつながりは今までどおり。

import { useLayoutEffect, useRef, useState } from "react";
import { upsertRecord, PrivateStoreError } from "@/lib/private-store-client";
import {
  emptyOneOnOneData,
  genOneOnOneKey,
  type OneOnOneData,
  type OneOnOneMode,
} from "@/lib/one-on-one";
import { RWDEPC_E_GUARD, RWDEPC_R_NOTE, RWDEPC_STEPS } from "@/lib/rwdepc";
import { RwdepcInfo } from "@/components/RwdepcInfo";
import { jstTodayYmd } from "@/lib/library";
import { SEED_MARK } from "@/lib/test-seed";
import {
  SAMPLE_TRANSCRIPT,
  SUMMARY_LABELS,
  TRANSCRIPT_ACCEPT,
  TRANSCRIPT_DRAFT_MARK,
  TRANSCRIPT_FLAGGED_NOTICE,
  TRANSCRIPT_MAX_CHARS,
  TRANSCRIPT_NOTICE,
  TRANSCRIPT_NO_KEEP_NOTICE,
  transcriptDefaultHeldOn,
  type TranscriptDraft,
  type TranscriptSummary,
} from "@/lib/one-on-one-transcript";

type StaffOption = { userId: string; name: string };

/**
 * 224: 文の長さに合わせて高さが伸びる入力欄。
 * 「本人の言葉」は長い引用が入るので、1行の入力欄だと途中で切れて、
 * 保存の前に全文を確かめられなかった。折り返して全部見えるようにする。
 * （高さは状態に入れず、要素のスタイルを直に書き換える）
 */
function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const cs = getComputedStyle(el);
  // scrollHeight は枠線を含まない。border-box（Tailwindの既定）のままだと枠線の分だけ足りず、
  // 最後の行が2pxだけ隠れる
  const extra =
    cs.boxSizing === "border-box"
      ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
      : -((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0));
  el.style.height = `${el.scrollHeight + extra}px`;
}

function AutoGrowTextarea({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    fitHeight(ref.current);
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        fitHeight(e.currentTarget);
        onChange(e.target.value);
      }}
      className={`${className} resize-none overflow-hidden`}
      aria-label={ariaLabel}
    />
  );
}

export function TranscriptImportDialog({
  staff,
  staffOptions,
  defaultHeldOn,
  scheduleDates,
  myName,
  sampleAllowed = false,
  onClose,
  onSaved,
}: {
  /** 成長記録から開いたとき＝スタッフが決まっている */
  staff?: StaffOption;
  /** 1on1ノートから開いたとき＝選ばせる */
  staffOptions?: StaffOption[];
  /**
   * 画面で既に選ばれていた実施日（先の日付は使わない・223 §4）
   */
  defaultHeldOn?: string;
  /** そのスタッフの1on1の予約日（実施日の初期値を決めるのに使う・223 §4） */
  scheduleDates?: readonly string[];
  myName: string;
  /** 検証用アカウントのときだけ「見本を入れる」を出す */
  sampleAllowed?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [staffId, setStaffId] = useState(staff?.userId ?? "");
  // 223 §4: ① 今日の予約があれば今日 → ② 今日より前でいちばん近い予約日 → ③ 今日。先の日付は初期値にしない
  const [heldOn, setHeldOn] = useState(() =>
    transcriptDefaultHeldOn(scheduleDates ?? [], jstTodayYmd(), defaultHeldOn)
  );
  const [mode, setMode] = useState<OneOnOneMode>("rwdepc");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [summary, setSummary] = useState<TranscriptSummary | null>(null);
  /** 221 §7: 相手が検証用アカウント＝保存する記録を一括削除の対象にする */
  const [testSeed, setTestSeed] = useState(false);
  const [draft, setDraft] = useState<TranscriptDraft | null>(null);
  /** まだAIの下書きのままの欄（直すと消える・221 §2-4） */
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());

  const options = staffOptions ?? (staff ? [staff] : []);
  const staffName = options.find((o) => o.userId === staffId)?.name ?? staff?.name ?? "";

  const markEdited = (key: string) =>
    setAiFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const run = async () => {
    if (!staffId) return setError("スタッフを選んでください");
    if (!heldOn) return setError("実施日を選んでください");
    const file = fileRef.current?.files?.[0];
    if (!file && !text.trim()) return setError("書き起こしを貼り付けるか、ファイルを選んでください");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("userId", staffId);
      form.set("heldOn", heldOn);
      form.set("mode", mode);
      if (file) form.set("file", file);
      else form.set("text", text);
      const res = await fetch("/api/one-on-one/transcript", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        summary?: TranscriptSummary;
        draft?: TranscriptDraft;
        flagged?: boolean;
        testSeed?: boolean;
        error?: string;
      };
      if (!res.ok || !j.summary || !j.draft) {
        throw new Error(j.error || `整理できませんでした (${res.status})`);
      }
      setSummary(j.summary);
      setDraft(j.draft);
      setFlagged(j.flagged === true);
      setTestSeed(j.testSeed === true);
      setAiFields(
        new Set([
          "flow", "quotes", "decided", "support",
          "theme", "kizuki", "nextStep",
          "r", "w", "d", "e", "p", "c",
        ])
      );
      // 221 §5: 送り終わった原文はここで捨てる（画面にも残さない）
      setText("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "整理できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!summary || !draft) return;
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const data: OneOnOneData = {
        ...emptyOneOnOneData(),
        mode,
        heldOn,
        participantIds: [staffId],
        partnerName: staffName,
        authorName: myName,
        sections: { ...draft.sections },
        rwdepc: { ...draft.rwdepc },
        summary,
        createdAt: now,
        updatedAt: now,
      };
      await upsertRecord("one_on_one", genOneOnOneKey(), {
        ...data,
        // 221 §7: 検証用アカウントの回は「🧪 検証用データの一括削除」の対象にする
        ...(testSeed ? { [SEED_MARK]: true } : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof PrivateStoreError ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const areaClass =
    "w-full rounded-md border border-gray-200 px-2 py-1.5 text-[13px] bg-white";
  const mark = (key: string) =>
    aiFields.has(key) ? (
      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-900" data-ai-mark={key}>
        {TRANSCRIPT_DRAFT_MARK}
      </span>
    ) : null;

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-white p-3 space-y-3" data-transcript-dialog>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">📄 書き起こしから記録する</h2>
        <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 min-h-[32px]">
          やめる
        </button>
      </div>
      <p className="text-[11px] text-gray-600">{TRANSCRIPT_NO_KEEP_NOTICE}</p>
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" role="alert">
          {error}
        </p>
      )}

      {!summary ? (
        <div className="space-y-2" data-transcript-step="input">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[12px] text-gray-800">
              スタッフ
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                disabled={!!staff}
                className="block border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] min-h-[36px]"
                aria-label="スタッフ"
              >
                <option value="">選んでください</option>
                {options.map((o) => (
                  <option key={o.userId} value={o.userId}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-gray-800">
              実施日
              <input
                type="date"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
                className="block border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] min-h-[36px]"
                aria-label="実施日"
              />
            </label>
            <label className="text-[12px] text-gray-800">
              <span className="inline-flex items-center gap-1">
                記録の形式
                {/* 223 §1-3: 選択肢の横に ⓘ */}
                <RwdepcInfo withWord={false} />
              </span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value === "quick" ? "quick" : "rwdepc")}
                className="block border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] min-h-[36px]"
                aria-label="記録の形式"
              >
                <option value="rwdepc">RWDEPC</option>
                <option value="quick">クイックメモ</option>
              </select>
            </label>
          </div>

          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            ⚠ {TRANSCRIPT_NOTICE}
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, TRANSCRIPT_MAX_CHARS))}
            rows={8}
            placeholder="書き起こしを貼り付けてください"
            className={areaClass}
            aria-label="書き起こし"
            data-transcript-text
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-gray-500 tabular-nums">
              {text.length} / {TRANSCRIPT_MAX_CHARS}字
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={TRANSCRIPT_ACCEPT}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="text-[11px]"
              aria-label="書き起こしのファイル"
            />
            {fileName && <span className="text-[11px] text-gray-600">{fileName}</span>}
            {sampleAllowed && (
              <button
                type="button"
                onClick={() => setText(SAMPLE_TRANSCRIPT)}
                className="text-[11px] px-2 py-1 border border-violet-300 text-violet-800 rounded-full min-h-[32px]"
                data-transcript-sample
              >
                🧪 検証用の見本を入れる
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="px-4 py-2 bg-violet-600 text-white rounded-full text-sm hover:bg-violet-700 disabled:opacity-40 min-h-[44px]"
            data-transcript-run
          >
            {busy ? "整理しています…" : "🤖 AIで整理する"}
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-transcript-step="review">
          {flagged && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5" data-transcript-flagged>
              {TRANSCRIPT_FLAGGED_NOTICE}
            </p>
          )}

          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-2" data-transcript-summary>
            <h3 className="text-[12px] font-medium text-violet-900">📝 まとめ（記録として残ります）</h3>
            <label className="block text-[11px] text-gray-700">
              {SUMMARY_LABELS.flow}{mark("flow")}
              <textarea value={summary.flow} onChange={(e) => { markEdited("flow"); setSummary({ ...summary, flow: e.target.value }); }} rows={4} className={areaClass} aria-label={SUMMARY_LABELS.flow} />
            </label>
            <div className="text-[11px] text-gray-700">
              {SUMMARY_LABELS.quotes}{mark("quotes")}
              {summary.quotes.length === 0 ? (
                <p className="text-[11px] text-gray-500">（ありません）</p>
              ) : (
                summary.quotes.map((q, i) => (
                  // 224: 長い引用も折り返して全文が見える（文の長さに合わせて高さが伸びる）
                  <AutoGrowTextarea
                    key={i}
                    value={q}
                    onChange={(v) => {
                      markEdited("quotes");
                      const next = [...summary.quotes];
                      next[i] = v;
                      setSummary({ ...summary, quotes: next });
                    }}
                    className={`${areaClass} mt-1`}
                    ariaLabel={`${SUMMARY_LABELS.quotes}${i + 1}`}
                  />
                ))
              )}
            </div>
            <label className="block text-[11px] text-gray-700">
              {SUMMARY_LABELS.decided}{mark("decided")}
              <textarea value={summary.decided} onChange={(e) => { markEdited("decided"); setSummary({ ...summary, decided: e.target.value }); }} rows={2} className={areaClass} aria-label={SUMMARY_LABELS.decided} />
            </label>
            <label className="block text-[11px] text-gray-700">
              {SUMMARY_LABELS.support}{mark("support")}
              <textarea value={summary.support} onChange={(e) => { markEdited("support"); setSummary({ ...summary, support: e.target.value }); }} rows={2} className={areaClass} aria-label={SUMMARY_LABELS.support} />
            </label>
          </section>

          <section className="rounded-lg border border-gray-200 p-2 space-y-2" data-transcript-draft>
            <h3 className="text-[12px] font-medium text-gray-900" data-rwdepc-heading>
              {mode === "rwdepc" ? (
                <>
                  🗣 <RwdepcInfo className="text-[12px]" />の記録欄
                </>
              ) : (
                "📋 クイックメモの記録欄"
              )}
            </h3>
            {mode === "quick" ? (
              ([
                ["theme", "話したテーマ"],
                ["kizuki", "気づき・学び"],
                ["nextStep", "次の一歩"],
              ] as const).map(([k, label]) => (
                <label key={k} className="block text-[11px] text-gray-700">
                  {label}{mark(k)}
                  <textarea
                    value={draft?.sections[k] ?? ""}
                    onChange={(e) => { markEdited(k); setDraft((d) => (d ? { ...d, sections: { ...d.sections, [k]: e.target.value } } : d)); }}
                    rows={3}
                    className={areaClass}
                    aria-label={label}
                  />
                </label>
              ))
            ) : (
              RWDEPC_STEPS.map((step) => (
                <label key={step.key} className="block text-[11px] text-gray-700">
                  {step.mark}｜{step.label}{mark(step.key)}
                  {step.key === "r" && (
                    <span className="block text-[10px] text-gray-600">{RWDEPC_R_NOTE}</span>
                  )}
                  {step.key === "e" && (
                    <span className="block text-[10px] text-amber-800">{RWDEPC_E_GUARD}</span>
                  )}
                  <textarea
                    value={draft?.rwdepc[step.key] ?? ""}
                    onChange={(e) => { markEdited(step.key); setDraft((d) => (d ? { ...d, rwdepc: { ...d.rwdepc, [step.key]: e.target.value } } : d)); }}
                    rows={3}
                    className={areaClass}
                    aria-label={`${step.mark} ${step.label}`}
                  />
                </label>
              ))
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
              data-transcript-save
            >
              {busy ? "保存しています…" : "💾 保存する"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[44px]">
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
