"use client";

// 🪄 文章から取り込む（指示書177）— 振り返り画面のパネル（管理者のみ）
//
// STEP 1 入力（貼り付け／ファイル・対象の期）→ STEP 2 AIの仕分け提案（行き先・内容・根拠・採否）
//   → STEP 3 採用したものだけを既存の保存API（/api/director-retrospective）で保存。
// AIは提案するだけ。保存するのは院長がチェックしたものだけ（150と同じ作法）。
// 既に内容がある欄は既定で「追記」。四象限の配分・分類はどの保存にも含めない（lib/retro-import.ts の buildSavePlan）。
//
// 176-補: 入力欄と提案（編集中の内容を含む）は sessionStorage の下書きに置く（再読み込みで戻る・タブを閉じると消える）。
// このパネルはデータ取得後にだけ描画される（初回描画で sessionStorage を読むため）。

import { useMemo, useState } from "react";
import {
  DELEGATION_STATUSES,
  EVENT_KINDS,
  INITIATIVE_STATUSES,
  PATIENT_NOTICE,
  RECORDED_MODES,
  createRetrospectiveRecord,
  patchRetrospectiveRecord,
  periodRangeLabel,
  sortPeriods,
  type RetrospectiveData,
} from "@/lib/director-retrospective";
import {
  IMPORT_DESTS,
  IMPORT_FILE_ACCEPT,
  IMPORT_MAX,
  SNAPSHOT_TEXT_FIELDS,
  analyzeImport,
  buildSavePlan,
  existingTextFor,
  extractImportFile,
  importDestLabel,
  isCandidateRef,
  snapshotFieldLabel,
  type ImportProposal,
  type ImportResult,
  type MergeMode,
  type PeriodCandidate,
  type SnapshotTextField,
} from "@/lib/retro-import";
import {
  DISCARD_CONFIRM,
  clearDraft,
  readDraft,
  useDraft,
  useHasDraft,
  writeDraft,
} from "@/lib/retro-drafts";

const INPUT = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[40px] bg-white";
const TEXTAREA =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[72px] bg-white leading-relaxed";
const BTN_PRIMARY =
  "px-4 py-2 rounded-full bg-teal text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 min-h-[40px]";
const BTN_GHOST =
  "px-3 py-2 rounded-full border border-gray-300 text-gray-700 text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]";
const BTN_SMALL =
  "px-2.5 py-1.5 rounded-full border border-gray-300 text-gray-700 text-[11px] hover:bg-gray-50 disabled:opacity-40 min-h-[32px]";

const INPUT_DRAFT_KEY = "import:input";
const RESULT_DRAFT_KEY = "import:result";

/** 提案の一覧と、院長が画面で決めたこと（下書きとしてそのまま保存する形） */
type ReviewState = {
  result: ImportResult;
  proposals: ImportProposal[];
  candidates: PeriodCandidate[];
  adopted: string[];
  merge: Record<string, MergeMode>;
  approvedCandidates: string[];
  recordedMode: "retrospective" | "contemporaneous";
  /** 前回の保存で失敗した提案の理由 */
  failures: Record<string, string>;
};

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-gray-700 mb-1">{children}</span>;
}

/** 行き先の選択肢の値（スナップショットは欄まで含める） */
function destValue(p: ImportProposal): string {
  return p.dest === "snapshot" ? `snapshot:${p.snapshotField}` : p.dest;
}

/** 行き先を変える。本文は移し替えて失わない */
function changeDest(p: ImportProposal, value: string): ImportProposal {
  const [dest, field] = value.split(":") as [ImportProposal["dest"], string | undefined];
  const next: ImportProposal = { ...p, dest };
  if (dest === "snapshot" && field) next.snapshotField = field as SnapshotTextField;
  const fromStructured = p.dest === "initiative" || p.dest === "delegation";
  const toStructured = dest === "initiative" || dest === "delegation";
  if (fromStructured && !toStructured && !next.text.trim()) {
    next.text = (p.dest === "initiative" ? [p.name, p.aim, p.result, p.learning] : [p.task, p.toRole])
      .filter((s) => s.trim())
      .join("\n");
  }
  if (!fromStructured && dest === "initiative" && ![p.aim, p.result, p.learning].some((s) => s.trim())) {
    next.aim = p.text;
  }
  if (!fromStructured && dest === "delegation" && !p.task.trim()) {
    next.task = p.text.slice(0, 120);
  }
  return next;
}

function initialReview(result: ImportResult): ReviewState {
  return {
    result,
    proposals: result.proposals,
    candidates: result.candidates,
    // 採否の既定はON。ただし未分類は行き先が決まっていないのでOFF
    adopted: result.proposals.filter((p) => p.dest !== "unclassified").map((p) => p.id),
    merge: {},
    // 新しい期の作成は院長の承認後（既定OFF）
    approvedCandidates: [],
    recordedMode: "retrospective",
    failures: {},
  };
}

export function RetrospectiveImportPanel({
  data,
  onSaved,
}: {
  data: RetrospectiveData;
  onSaved: () => Promise<void> | void;
}) {
  const periods = useMemo(() => sortPeriods(data.periods), [data.periods]);
  const hasDraft = useHasDraft("import:");
  const [open, setOpen] = useState(hasDraft);
  const input = useDraft(INPUT_DRAFT_KEY, { text: "", periodId: "" });
  const [review, setReviewState] = useState<ReviewState | null>(() => readDraft<ReviewState>(RESULT_DRAFT_KEY));
  const [busy, setBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const setReview = (next: ReviewState | null) => {
    setReviewState(next);
    if (next) writeDraft(RESULT_DRAFT_KEY, next);
    else clearDraft(RESULT_DRAFT_KEY);
  };
  const updateReview = (fn: (r: ReviewState) => ReviewState) => {
    if (review) setReview(fn(review));
  };
  const updateProposal = (id: string, fn: (p: ImportProposal) => ImportProposal) =>
    updateReview((r) => ({ ...r, proposals: r.proposals.map((p) => (p.id === id ? fn(p) : p)) }));
  const updateCandidate = (ref: string, fn: (c: PeriodCandidate) => PeriodCandidate) =>
    updateReview((r) => ({ ...r, candidates: r.candidates.map((c) => (c.ref === ref ? fn(c) : c)) }));

  const textLen = input.values.text.length;
  const tooLong = textLen > IMPORT_MAX;

  // ─── STEP 1 ───

  const readFile = async (file: File) => {
    setFileBusy(true);
    setError("");
    setMsg("");
    try {
      const t = await extractImportFile(file);
      input.set("text", input.values.text.trim() ? `${input.values.text.trim()}\n\n${t}` : t);
      setMsg(`📄 ${file.name} の文章を入力欄に入れました（${t.length.toLocaleString()}文字）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setFileBusy(false);
    }
  };

  const analyze = async () => {
    if (review && !confirm("いまの提案一覧を破棄して、仕分けし直します。よろしいですか？")) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const result = await analyzeImport({ text: input.values.text, periodId: input.values.periodId || null });
      setReview(initialReview(result));
      setMsg(`🪄 ${result.proposals.length}件の提案を作りました。内容と根拠を確かめて、採用するものを保存してください`);
    } catch (e) {
      // 176と同じ: 理由を出し、入力は残す
      setError(e instanceof Error ? e.message : "解析に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  // ─── STEP 2・3 ───

  const plan = useMemo(() => {
    if (!review) return null;
    return buildSavePlan({
      proposals: review.proposals,
      adopted: new Set(review.adopted),
      merge: review.merge,
      candidates: review.candidates,
      approvedCandidates: new Set(review.approvedCandidates),
      recordedMode: review.recordedMode,
      data,
    });
  }, [review, data]);

  const savableCount = plan ? new Set(plan.ops.flatMap((o) => o.proposalIds)).size : 0;
  const createCount = plan ? plan.ops.filter((o) => o.op === "createPeriod").length : 0;

  const save = async () => {
    if (!review || !plan) return;
    setBusy(true);
    setError("");
    setMsg("");
    const createdPeriod = new Map<string, string>(); // 候補 ref → 作った期の id
    const saved = new Set<string>();
    const failures: Record<string, string> = {};
    for (const op of plan.ops) {
      try {
        if (op.op === "createPeriod") {
          const rec = await createRetrospectiveRecord("period", op.fields);
          createdPeriod.set(op.candidateRef, rec.record.id);
        } else if (op.op === "create") {
          const periodId = isCandidateRef(op.periodRef) ? createdPeriod.get(op.periodRef) : op.periodRef;
          if (!periodId) throw new Error("新しい期を作れなかったため保存していません");
          await createRetrospectiveRecord(op.kind, { ...op.fields, periodId });
        } else {
          await patchRetrospectiveRecord(op.kind, op.id, op.fields);
        }
        op.proposalIds.forEach((id) => saved.add(id));
      } catch (e) {
        const reason = e instanceof Error ? e.message : "保存に失敗しました";
        op.proposalIds.forEach((id) => (failures[id] = reason));
        if (op.op === "createPeriod") failures[`candidate:${op.candidateRef}`] = reason;
      }
    }
    // 保存できたものは一覧から外す。作った期を指していた残りの提案は、その期の id に付け替える
    const rest = review.proposals
      .filter((p) => !saved.has(p.id))
      .map((p) => (createdPeriod.has(p.periodRef) ? { ...p, periodRef: createdPeriod.get(p.periodRef)! } : p));
    const restCandidates = review.candidates.filter((c) => !createdPeriod.has(c.ref));
    await onSaved();
    const savedCount = saved.size + createdPeriod.size;
    const failedCount = Object.keys(failures).length;
    if (rest.length === 0 && restCandidates.length === 0) {
      setReview(null);
      clearDraft(INPUT_DRAFT_KEY);
      input.discard();
      setMsg(`💾 ${savedCount}件を保存しました。取り込みはすべて終わりました`);
    } else {
      setReview({
        ...review,
        proposals: rest,
        candidates: restCandidates,
        adopted: review.adopted.filter((id) => rest.some((p) => p.id === id)),
        approvedCandidates: review.approvedCandidates.filter((r) => !createdPeriod.has(r)),
        failures,
      });
      if (failedCount > 0) setError(`${failedCount}件を保存できませんでした。各提案に理由を表示しています（入力はそのまま残っています）`);
      setMsg(savedCount > 0 ? `💾 ${savedCount}件を保存しました。残りの提案は一覧に残っています` : "");
    }
    setBusy(false);
  };

  const discardAll = () => {
    if (!confirm(DISCARD_CONFIRM)) return;
    setReview(null);
    input.discard();
    clearDraft(INPUT_DRAFT_KEY);
    setMsg("");
    setError("");
  };

  const periodName = (ref: string): string => {
    if (!ref) return "（期は未定）";
    if (isCandidateRef(ref)) {
      const c = review?.candidates.find((x) => x.ref === ref);
      return c ? `🆕 ${c.name}（新しい期の候補）` : "（見つからない期）";
    }
    const p = data.periods.find((x) => x.id === ref);
    return p ? p.name : "（見つからない期）";
  };

  return (
    <section className="rounded-xl border border-violet-200 bg-white p-3 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-900 min-h-[36px]"
      >
        <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
        🪄 文章から取り込む
        {hasDraft && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-normal">
            📝 下書きあり
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            まとめて書いた文章・エピソード・インタビューの書き起こしを貼ると、AIが各項目（期・出来事・時間管理スナップショット・施策・権限委譲）に
            <strong>仕分けた提案</strong>を出します。<strong>保存されるのは、確認して採用にチェックしたものだけ</strong>です。
            AIに送る前に登録済みスタッフの氏名は役割名に置き換えます。貼り付けた原文は保存しません。
            <strong>四象限の配分・分類はAIは扱いません</strong>（ご自身で入力してください）。
          </p>
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            ⚠️ {PATIENT_NOTICE}
          </p>

          {error && (
            <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              ⚠️ {error}
            </p>
          )}
          {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

          {/* STEP 1 入力 */}
          <div className="space-y-2">
            <div>
              <Label>STEP 1　文章（エピソード・文章・インタビューの書き起こし）</Label>
              <textarea
                value={input.values.text}
                onChange={(e) => input.set("text", e.target.value)}
                className={`${TEXTAREA} min-h-[180px]`}
                placeholder="例: 2022年4月に開業した。最初の半年は朝7時から夜11時まで…（質問と回答が混ざった書き起こしでも構いません。院長の回答部分を素材にします）"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                <p className={`text-[11px] tabular-nums ${tooLong ? "text-red-700" : "text-gray-500"}`}>
                  {textLen.toLocaleString()} / {IMPORT_MAX.toLocaleString()}文字まで
                  {tooLong && "（上限を超えています。分けて取り込んでください）"}
                  {input.dirty && <span className="ml-2 text-amber-800">📝 下書き（このタブに一時保存中）</span>}
                </p>
                <label className={`${BTN_SMALL} cursor-pointer inline-flex items-center`}>
                  {fileBusy ? "読み込み中…" : "📄 ファイルから読み込む"}
                  <input
                    type="file"
                    accept={IMPORT_FILE_ACCEPT}
                    className="hidden"
                    disabled={fileBusy || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void readFile(f);
                    }}
                  />
                </label>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                読み込めるファイル: .txt / .md / .docx / .pptx（5MBまで）。PDFはAIでしか文字を読めず、氏名を置き換える前の本文がAIに渡るため対象外です（文章をコピーして貼り付けてください）。
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <Label>対象の期</Label>
                <select
                  value={input.values.periodId}
                  onChange={(e) => input.set("periodId", e.target.value)}
                  className={INPUT}
                >
                  <option value="">AIに判定させる（既定）</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{periodRangeLabel(p) || "期間未設定"}）
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={analyze}
                disabled={busy || fileBusy || !input.values.text.trim() || tooLong}
                className={BTN_PRIMARY}
              >
                {busy && !review ? "AIが仕分けています…（長い文章は1分ほど）" : "🪄 仕分ける"}
              </button>
              {(input.dirty || review) && (
                <button type="button" onClick={discardAll} disabled={busy} className={BTN_GHOST}>
                  🗑 入力と提案を破棄
                </button>
              )}
            </div>
          </div>

          {/* STEP 2・3 */}
          {review && plan && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <div className="text-[11px] text-gray-600 leading-relaxed space-y-0.5">
                <p className="font-medium text-gray-800">STEP 2　AIの仕分け提案（{review.proposals.length}件）</p>
                <p>
                  根拠が元の文章に見つからず除外: {review.result.stats.droppedNoEvidence}件 ／ 質問者の発言だけが根拠のため除外:{" "}
                  {review.result.stats.droppedQuestioner}件 ／ 四象限の値を破棄: {review.result.stats.quadrantDiscarded}件 ／ AI:{" "}
                  {review.result.provider} / {review.result.model}
                  {review.result.stats.chunks > 1 && ` ／ ${review.result.stats.chunks}つに区切って解析`}
                </p>
                {review.result.stats.failedChunks.length > 0 && (
                  <p className="text-red-700">
                    ⚠️ 区切り {review.result.stats.failedChunks.join("・")} 番目を解析できませんでした。その部分の提案はありません（必要なら、その部分だけ貼って仕分け直してください）。
                  </p>
                )}
              </div>

              {/* 新しい期の候補 */}
              {review.candidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-gray-800">🆕 新しい期の候補（作成は承認したときだけ）</p>
                  {review.candidates.map((c) => {
                    const approved = review.approvedCandidates.includes(c.ref);
                    const n = review.proposals.filter((p) => p.periodRef === c.ref).length;
                    const failure = review.failures[`candidate:${c.ref}`] || plan.blocked[`candidate:${c.ref}`];
                    return (
                      <div key={c.ref} className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
                        <label className="flex items-center gap-2 text-[12px] font-medium text-gray-900 min-h-[32px]">
                          <input
                            type="checkbox"
                            checked={approved}
                            onChange={(e) =>
                              updateReview((r) => ({
                                ...r,
                                approvedCandidates: e.target.checked
                                  ? [...r.approvedCandidates, c.ref]
                                  : r.approvedCandidates.filter((x) => x !== c.ref),
                              }))
                            }
                          />
                          この期を作成する（この期への提案 {n}件）
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block sm:col-span-1">
                            <Label>期の名称</Label>
                            <input
                              value={c.name}
                              onChange={(e) => updateCandidate(c.ref, (x) => ({ ...x, name: e.target.value }))}
                              className={INPUT}
                            />
                          </label>
                          <label className="block">
                            <Label>開始年月（必須）</Label>
                            <input
                              type="month"
                              value={c.startYm}
                              onChange={(e) => updateCandidate(c.ref, (x) => ({ ...x, startYm: e.target.value }))}
                              className={INPUT}
                            />
                          </label>
                          <label className="block">
                            <Label>終了年月</Label>
                            <input
                              type="month"
                              value={c.endYm}
                              onChange={(e) => updateCandidate(c.ref, (x) => ({ ...x, endYm: e.target.value }))}
                              className={INPUT}
                            />
                          </label>
                        </div>
                        <Evidence text={c.evidence} />
                        <Warnings list={c.warnings} />
                        {failure && approved && <p className="text-[11px] text-red-700">⚠️ {failure}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 提案一覧（未分類は末尾） */}
              <div className="space-y-2">
                {review.proposals.map((p) => {
                  const adopted = review.adopted.includes(p.id);
                  const existing = existingTextFor(p, data);
                  const mode = review.merge[p.id] ?? "append";
                  const blockedReason = adopted ? plan.blocked[p.id] : "";
                  const failure = review.failures[p.id];
                  const newSnapshot =
                    p.dest === "snapshot" &&
                    (isCandidateRef(p.periodRef) || (p.periodRef && !data.snapshots.some((s) => s.periodId === p.periodRef)));
                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg border p-2.5 space-y-2 ${
                        p.dest === "unclassified"
                          ? "border-dashed border-gray-300 bg-gray-50"
                          : adopted
                            ? "border-teal-200 bg-white"
                            : "border-gray-200 bg-gray-50 opacity-80"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-[12px] font-medium min-h-[32px]">
                          <input
                            type="checkbox"
                            checked={adopted}
                            onChange={(e) =>
                              updateReview((r) => ({
                                ...r,
                                adopted: e.target.checked ? [...r.adopted, p.id] : r.adopted.filter((x) => x !== p.id),
                              }))
                            }
                          />
                          採用
                        </label>
                        <span className="text-[11px] text-gray-600">
                          行き先: <strong>{periodName(p.periodRef)}</strong> ／{" "}
                          <strong>
                            {p.dest === "snapshot"
                              ? `スナップショット「${snapshotFieldLabel(p.snapshotField)}」`
                              : importDestLabel(p.dest)}
                          </strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block">
                          <Label>期（変更できます）</Label>
                          <select
                            value={p.periodRef}
                            onChange={(e) => updateProposal(p.id, (x) => ({ ...x, periodRef: e.target.value }))}
                            className={INPUT}
                          >
                            <option value="">（期は未定）</option>
                            {periods.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                            {review.candidates.map((c) => (
                              <option key={c.ref} value={c.ref}>
                                🆕 {c.name}（新しい期の候補）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <Label>項目（変更できます）</Label>
                          <select
                            value={destValue(p)}
                            onChange={(e) => updateProposal(p.id, (x) => changeDest(x, e.target.value))}
                            className={INPUT}
                          >
                            {IMPORT_DESTS.flatMap((d) =>
                              d.value === "snapshot"
                                ? SNAPSHOT_TEXT_FIELDS.map((f) => (
                                    <option key={`snapshot:${f.key}`} value={`snapshot:${f.key}`}>
                                      スナップショット「{f.label}」
                                    </option>
                                  ))
                                : [
                                    <option key={d.value} value={d.value}>
                                      {d.label}
                                    </option>,
                                  ]
                            )}
                          </select>
                        </label>
                      </div>

                      <ProposalFields
                        p={p}
                        periodStartYm={
                          isCandidateRef(p.periodRef)
                            ? review.candidates.find((c) => c.ref === p.periodRef)?.startYm ?? ""
                            : data.periods.find((x) => x.id === p.periodRef)?.startYm ?? ""
                        }
                        onChange={(fn) => updateProposal(p.id, fn)}
                      />

                      {existing.trim() && (p.dest === "snapshot" || p.dest === "period_summary") && (
                        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
                          <p className="text-[11px] font-medium text-amber-900">この欄には既に内容があります（既定は追記・上書きしません）</p>
                          <p className="text-[11px] text-gray-700 whitespace-pre-wrap bg-white border border-amber-100 rounded p-1.5 max-h-40 overflow-auto">
                            {existing}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              [
                                ["append", "追記（既定）"],
                                ["replace", "置き換え"],
                                ["skip", "採用しない"],
                              ] as const
                            ).map(([v, label]) => (
                              <label
                                key={v}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] min-h-[32px] cursor-pointer ${
                                  mode === v ? "border-teal bg-teal-light text-teal font-medium" : "border-gray-300 bg-white text-gray-700"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`merge-${p.id}`}
                                  checked={mode === v}
                                  onChange={() => updateReview((r) => ({ ...r, merge: { ...r.merge, [p.id]: v } }))}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {newSnapshot && (
                        <p className="text-[11px] text-gray-600">
                          この期のスナップショットを新しく作ります（記入時期は下の設定・四象限の配分は空のまま）。
                        </p>
                      )}

                      <Evidence text={p.evidence} />
                      <Warnings list={p.warnings} />
                      {blockedReason && <p className="text-[11px] text-red-700">⚠️ 保存できません: {blockedReason}</p>}
                      {failure && <p className="text-[11px] text-red-700">⚠️ 前回保存できませんでした: {failure}</p>}
                    </div>
                  );
                })}
                {review.proposals.length === 0 && (
                  <p className="text-[11px] text-gray-500">提案はありません。</p>
                )}
              </div>

              {/* STEP 3 */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                <p className="text-[12px] font-medium text-gray-800">STEP 3　採用して保存</p>
                <div>
                  <Label>新しく作るスナップショットの記入時期</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {RECORDED_MODES.map((m) => (
                      <label
                        key={m.value}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] min-h-[32px] cursor-pointer ${
                          review.recordedMode === m.value
                            ? "border-teal bg-teal-light text-teal font-medium"
                            : "border-gray-300 bg-white text-gray-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="import-recorded-mode"
                          checked={review.recordedMode === m.value}
                          onChange={() => updateReview((r) => ({ ...r, recordedMode: m.value }))}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">
                  保存するもの: 提案 {savableCount}件{createCount > 0 && `＋新しい期 ${createCount}件`}
                  {Object.keys(plan.blocked).filter((k) => !k.startsWith("candidate:")).length > 0 &&
                    `（採用中でも保存できないもの ${Object.keys(plan.blocked).filter((k) => !k.startsWith("candidate:")).length}件は理由を表示しています）`}
                </p>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || plan.ops.length === 0}
                  className={BTN_PRIMARY}
                >
                  {busy ? "保存しています…" : `✅ 採用した${savableCount}件を保存`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Evidence({ text }: { text: string }) {
  if (!text) return null;
  return (
    <blockquote className="text-[11px] text-gray-700 bg-slate-50 border-l-4 border-slate-300 rounded-r px-2 py-1.5 whitespace-pre-wrap leading-relaxed">
      <span className="block text-[10px] text-slate-500 mb-0.5">根拠（元の文章から）</span>
      {text}
    </blockquote>
  );
}

function Warnings({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <ul className="text-[11px] text-amber-900 space-y-0.5">
      {list.map((w) => (
        <li key={w}>⚠️ {w}</li>
      ))}
    </ul>
  );
}

function ProposalFields({
  p,
  periodStartYm,
  onChange,
}: {
  p: ImportProposal;
  periodStartYm: string;
  onChange: (fn: (p: ImportProposal) => ImportProposal) => void;
}) {
  const set = <K extends keyof ImportProposal>(k: K, v: ImportProposal[K]) => onChange((x) => ({ ...x, [k]: v }));
  if (p.dest === "event") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block">
            <Label>年月（必須）</Label>
            <input type="month" value={p.ym} onChange={(e) => set("ym", e.target.value)} className={INPUT} />
            {!p.ym && (
              <span className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-gray-500">
                文章から読み取れなかったため空欄です。
                {periodStartYm && (
                  <button type="button" onClick={() => set("ym", periodStartYm)} className={BTN_SMALL}>
                    期の開始年月（{periodStartYm}）を入れる
                  </button>
                )}
              </span>
            )}
          </label>
          <label className="block">
            <Label>種別</Label>
            <select value={p.eventKind} onChange={(e) => set("eventKind", e.target.value as ImportProposal["eventKind"])} className={INPUT}>
              {EVENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <Label>内容（編集できます）</Label>
          <textarea value={p.text} onChange={(e) => set("text", e.target.value)} className={TEXTAREA} />
        </label>
      </div>
    );
  }
  if (p.dest === "initiative") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block">
            <Label>施策名（必須）</Label>
            <input value={p.name} onChange={(e) => set("name", e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <Label>状態</Label>
            <select value={p.status} onChange={(e) => set("status", e.target.value as ImportProposal["status"])} className={INPUT}>
              {INITIATIVE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>計画した時期</Label>
            <input type="month" value={p.plannedYm} onChange={(e) => set("plannedYm", e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <Label>実施した時期</Label>
            <input type="month" value={p.doneYm} onChange={(e) => set("doneYm", e.target.value)} className={INPUT} />
          </label>
        </div>
        <label className="block">
          <Label>狙い</Label>
          <textarea value={p.aim} onChange={(e) => set("aim", e.target.value)} className={TEXTAREA} />
        </label>
        <label className="block">
          <Label>結果</Label>
          <textarea value={p.result} onChange={(e) => set("result", e.target.value)} className={TEXTAREA} />
        </label>
        <label className="block">
          <Label>学び</Label>
          <textarea value={p.learning} onChange={(e) => set("learning", e.target.value)} className={TEXTAREA} />
        </label>
        <p className="text-[10px] text-gray-500">四象限（どの領域の仕事か）はAIは提案しません。保存後に施策の「✏️ 編集」でご自身で付けてください。</p>
      </div>
    );
  }
  if (p.dest === "delegation") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block">
          <Label>業務（必須）</Label>
          <input value={p.task} onChange={(e) => set("task", e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <Label>状態</Label>
          <select
            value={p.delegationStatus}
            onChange={(e) => set("delegationStatus", e.target.value as ImportProposal["delegationStatus"])}
            className={INPUT}
          >
            {DELEGATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>委譲先（役割）</Label>
          <input value={p.toRole} onChange={(e) => set("toRole", e.target.value)} className={INPUT} />
        </label>
      </div>
    );
  }
  return (
    <label className="block">
      <Label>
        {p.dest === "unclassified"
          ? "内容（未分類・行き先を選ぶと保存できます）"
          : p.dest === "snapshot"
            ? `${snapshotFieldLabel(p.snapshotField)}（編集できます）`
            : "期の一言要約（編集できます）"}
      </Label>
      <textarea value={p.text} onChange={(e) => set("text", e.target.value)} className={TEXTAREA} />
    </label>
  );
}

