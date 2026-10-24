"use client";

// 1on1の「ウェルネスの視点」の画面部品（指示書 mk_training_karte_wellness_1on1）
//
//   WellnessHints        … 問いのヒント（折りたたみ・初期は閉じる・文言は lib/wellness.ts の正本）
//   WellnessEditor       … 話した面（複数選択）＋選んだ面ごとのメモ。点数・評価・段階の欄は作らない
//   WellnessView         … 保存した視点を読むだけ
//   WellnessRecordBlock  … 1on1の1回分（読む／✏️ 書く・直す → 保存）
//   WellnessHistory      … これまでの視点（直近から・まだ話していない面は薄く）。グラフ・集計はしない
//
// 出すかどうかはサーバーの返事（/api/growth/wellness）で決める。本人・担当外には一切出さない。

import { useState } from "react";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import {
  WELLNESS_CANDIDATE_NOTE,
  WELLNESS_HINTS_BY_KEY,
  WELLNESS_HINTS_CAUTION,
  WELLNESS_HINTS_NEXT,
  WELLNESS_HINTS_OPENING,
  WELLNESS_HINTS_TITLE,
  WELLNESS_KEYS,
  WELLNESS_LABELS,
  WELLNESS_SECTION_NOTE,
  WELLNESS_SECTION_TITLE,
  normalizeWellnessNotes,
  sortWellnessHistory,
  untouchedWellnessKeys,
  type WellnessEntry,
  type WellnessKey,
} from "@/lib/wellness";
import { saveWellnessApi } from "@/lib/wellness-client";

export type WellnessValue = {
  tags: WellnessKey[];
  notes: Partial<Record<WellnessKey, string>>;
};

export const EMPTY_WELLNESS: WellnessValue = { tags: [], notes: {} };

export function hasWellness(v: WellnessValue): boolean {
  return v.tags.length > 0;
}

const ymdSlash = (ymd: string) => (ymd ? ymd.replaceAll("-", "/") : "日付なし");

export function WellnessHints() {
  return (
    <details className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-[12px] text-gray-800" data-wellness-hints>
      <summary className="cursor-pointer select-none font-medium text-emerald-900 min-h-[32px] flex items-center">
        {WELLNESS_HINTS_TITLE}
      </summary>
      <div className="mt-2 space-y-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 space-y-0.5" data-wellness-caution>
          {WELLNESS_HINTS_CAUTION.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div>
          <p className="font-medium text-gray-900">はじめに</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {WELLNESS_HINTS_OPENING.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-gray-900">次元ごとの問い</p>
          <dl className="mt-1 space-y-1">
            {WELLNESS_KEYS.map((k) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 w-[3em] font-medium text-emerald-900">{WELLNESS_LABELS[k]}</dt>
                <dd className="min-w-0 flex-1 break-words">{WELLNESS_HINTS_BY_KEY[k]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="font-medium text-gray-900">次の一歩</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {WELLNESS_HINTS_NEXT.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

export function WellnessEditor({
  value,
  onChange,
  disabled = false,
  candidates,
}: {
  value: WellnessValue;
  onChange: (v: WellnessValue) => void;
  disabled?: boolean;
  /** 書き起こしのAIが見つけた候補（選ばれてはいない・押して選ぶ） */
  candidates?: readonly WellnessKey[];
}) {
  const toggle = (k: WellnessKey) => {
    const tags = value.tags.includes(k)
      ? value.tags.filter((t) => t !== k)
      : WELLNESS_KEYS.filter((x) => x === k || value.tags.includes(x));
    onChange({ tags, notes: value.notes });
  };
  return (
    <div className="space-y-2" data-wellness-editor>
      {candidates && candidates.length > 0 && (
        <p className="text-[11px] text-violet-900" data-wellness-candidate-note>{WELLNESS_CANDIDATE_NOTE}</p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="話した次元">
        {WELLNESS_KEYS.map((k) => {
          const on = value.tags.includes(k);
          const candidate = !on && !!candidates?.includes(k);
          return (
            <button
              type="button"
              key={k}
              onClick={() => toggle(k)}
              disabled={disabled}
              aria-pressed={on}
              data-wellness-tag={k}
              data-wellness-candidate={candidate ? "1" : undefined}
              className={`min-h-[44px] min-w-[56px] px-3 rounded-full text-sm border disabled:opacity-50 ${
                on
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : candidate
                    ? "bg-violet-50 text-violet-900 border-violet-400 border-dashed"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {on ? "✓ " : candidate ? "候補 " : ""}
              {WELLNESS_LABELS[k]}
            </button>
          );
        })}
      </div>
      {value.tags.map((k) => (
        <label key={k} className="block text-[12px] text-gray-700">
          {WELLNESS_LABELS[k]}のメモ（本人の言葉を中心に）
          <AutoGrowTextarea
            value={value.notes[k] ?? ""}
            onChange={(v) => onChange({ tags: value.tags, notes: { ...value.notes, [k]: v } })}
            disabled={disabled}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            ariaLabel={`${WELLNESS_LABELS[k]}のメモ`}
          />
        </label>
      ))}
      <WellnessHints />
    </div>
  );
}

export function WellnessView({ entry }: { entry: WellnessValue }) {
  return (
    <div className="space-y-1" data-wellness-view>
      <div className="flex flex-wrap gap-1">
        {entry.tags.map((k) => (
          <span key={k} className="text-[11px] rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5">
            {WELLNESS_LABELS[k]}
          </span>
        ))}
      </div>
      {entry.tags.map((k) =>
        entry.notes[k]?.trim() ? (
          <p key={k} className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">
            <span className="text-gray-500">{WELLNESS_LABELS[k]}：</span>
            {entry.notes[k]}
          </p>
        ) : null
      )}
    </div>
  );
}

export function WellnessRecordBlock({
  userId,
  ownerId,
  oneOnOneKey,
  entry,
  onSaved,
}: {
  /** 誰のことか（1on1の相手のスタッフ） */
  userId: string;
  ownerId: string;
  oneOnOneKey: string;
  entry?: WellnessEntry;
  onSaved: (entry: WellnessEntry | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WellnessValue>(EMPTY_WELLNESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = () => {
    setDraft(entry ? { tags: entry.tags, notes: entry.notes } : EMPTY_WELLNESS);
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await saveWellnessApi({
        userId,
        ownerId,
        oneOnOneKey,
        tags: draft.tags,
        notes: normalizeWellnessNotes(draft.notes, draft.tags),
      });
      onSaved(saved);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-2 space-y-2" data-wellness-block={oneOnOneKey}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[12px] font-medium text-emerald-900">{WELLNESS_SECTION_TITLE}</h3>
        {!editing && (
          <button
            type="button"
            onClick={start}
            className="text-xs px-2 py-1 text-emerald-800 hover:opacity-70 min-h-[32px]"
            data-wellness-edit
          >
            ✏️ {entry ? "直す" : "書く"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <p className="text-[11px] text-gray-600">{WELLNESS_SECTION_NOTE}</p>
          <WellnessEditor value={draft} onChange={setDraft} disabled={busy} />
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 min-h-[36px]"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 min-h-[36px]"
              data-wellness-save
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </>
      ) : entry && entry.tags.length > 0 ? (
        <WellnessView entry={entry} />
      ) : (
        <p className="text-[11px] text-gray-500">まだ書いていません（書かなくても1on1の記録は残ります）。</p>
      )}
    </section>
  );
}

export function WellnessHistory({ entries }: { entries: readonly WellnessEntry[] }) {
  const history = sortWellnessHistory(entries);
  const untouched = new Set(untouchedWellnessKeys(history));
  return (
    <section className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2" data-wellness-history>
      <h2 className="text-sm font-medium text-gray-900">🌿 これまでの視点</h2>
      <p className="text-[11px] text-gray-500">1on1で話した面です（点数・評価はつけません。本人の画面には出ません）。</p>
      <div className="flex flex-wrap gap-1" data-wellness-overview>
        {WELLNESS_KEYS.map((k) => (
          <span
            key={k}
            data-wellness-dim={k}
            data-untouched={untouched.has(k) ? "1" : undefined}
            className={`text-[11px] rounded-full px-2 py-0.5 border ${
              untouched.has(k)
                ? "border-dashed border-gray-200 text-gray-300 bg-white"
                : "border-emerald-200 text-emerald-900 bg-emerald-50"
            }`}
            title={untouched.has(k) ? "まだ話したことのない面" : undefined}
          >
            {WELLNESS_LABELS[k]}
          </span>
        ))}
      </div>
      {untouched.size > 0 && (
        <p className="text-[11px] text-gray-400">薄い面は、まだ話したことのない面です。</p>
      )}
      {history.length === 0 ? (
        <p className="text-[11px] text-gray-500">まだ記録がありません。</p>
      ) : (
        <ol className="space-y-1.5">
          {history.map((e) => (
            <li key={e.id} className="flex gap-2" data-wellness-history-row>
              <span className="shrink-0 w-[5.5em] text-[11px] text-gray-500 pt-0.5">{ymdSlash(e.heldOn)}</span>
              <div className="min-w-0 flex-1 flex flex-wrap gap-1">
                {e.tags.map((k) => (
                  <span key={k} className="text-[11px] rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5">
                    {WELLNESS_LABELS[k]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
