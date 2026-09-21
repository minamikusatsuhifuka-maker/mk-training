"use client";

// 院長の振り返り記録の本体（指示書173）
// 画面に到達できている時点でサーバー側の認可は通っている（ここでの出し分けは体裁のみ）。
// 編集・出力は管理者のみ（API側でも管理者判定をやり直している）。
//
// 構成:
//   注意書き（患者情報を入れない・常時表示）
//   → 見える化（四象限の推移／権限委譲の推移／施策の状態一覧）
//   → 期のカード（出来事・スナップショット・施策・権限委譲を期ごとに登録・編集・削除）
//   → 発表用の出力（期の選択・匿名化・Markdownダウンロード）
//   → 操作ログ（管理者）

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DELEGATION_STATUSES,
  EVENT_KINDS,
  INITIATIVE_STATUSES,
  PATIENT_NOTICE,
  QUADRANT_LABELS,
  RECORDED_MODES,
  buildDelegationChartRows,
  buildInitiativeStatusRows,
  buildQuadrantChartRows,
  createRetrospectiveRecord,
  delegationStatusLabel,
  deleteRetrospectiveRecord,
  emptyRetrospectiveData,
  eventKindLabel,
  fetchRetrospective,
  fetchRetrospectiveMarkdown,
  initiativeStatusLabel,
  patchRetrospectiveRecord,
  periodRangeLabel,
  quadrantShortLabel,
  recordedModeLabel,
  snapshotOfPeriod,
  sortDelegations,
  sortEvents,
  sortInitiatives,
  sortPeriods,
  type ClinicEvent,
  type Delegation,
  type Initiative,
  type Period,
  type RecordInput,
  type RecordKind,
  type RetrospectiveData,
  type RetrospectiveRecord,
  type Snapshot,
} from "@/lib/director-retrospective";
import {
  DelegationTrendChart,
  InitiativeStatusTable,
  QuadrantTrendChart,
} from "@/components/DirectorRetrospectiveCharts";
import { DirectorRetrospectiveLogsPanel } from "@/components/admin/DirectorRetrospectiveLogsPanel";

// ─── 共通の小さな部品 ───

const INPUT =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";
const TEXTAREA =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[88px] bg-white leading-relaxed";
const BTN_PRIMARY =
  "px-4 py-2 rounded-full bg-teal text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 min-h-[40px]";
const BTN_GHOST =
  "px-3 py-2 rounded-full border border-gray-300 text-gray-700 text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]";
const BTN_SMALL =
  "px-2.5 py-1.5 rounded-full border border-gray-300 text-gray-700 text-[11px] hover:bg-gray-50 disabled:opacity-40 min-h-[32px]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="ml-1 text-gray-400 font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 年月（YYYY-MM）。iPhone/iPad は月ピッカー、対応しないブラウザは手入力 */
function MonthInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "2022-04"}
      pattern="\\d{4}-\\d{2}"
      className={INPUT}
    />
  );
}

function PatientNotice() {
  return (
    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
      ⚠️ {PATIENT_NOTICE}
    </p>
  );
}

function FormActions({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? "保存中…" : submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST}>
        キャンセル
      </button>
    </div>
  );
}

type SubmitFn = (input: RecordInput) => Promise<void>;

// ─── 期 ───

function PeriodForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Period | null;
  busy: boolean;
  onSubmit: SubmitFn;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startYm, setStartYm] = useState(initial?.startYm ?? "");
  const [endYm, setEndYm] = useState(initial?.endYm ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ name, startYm, endYm, summary });
      }}
      className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2"
    >
      <PatientNotice />
      <Field label="期の名称" hint="例: 2022 開業期">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} required />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="開始年月">
          <MonthInput value={startYm} onChange={setStartYm} />
        </Field>
        <Field label="終了年月" hint="進行中は空欄">
          <MonthInput value={endYm} onChange={setEndYm} />
        </Field>
      </div>
      <Field label="期の一言要約">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={TEXTAREA}
          rows={2}
        />
      </Field>
      <FormActions busy={busy} onCancel={onCancel} submitLabel={initial ? "💾 更新" : "＋ 期を登録"} />
    </form>
  );
}

// ─── 出来事 ───

function EventForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ClinicEvent | null;
  busy: boolean;
  onSubmit: SubmitFn;
  onCancel: () => void;
}) {
  const [ym, setYm] = useState(initial?.ym ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "other");
  const [content, setContent] = useState(initial?.content ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ ym, kind, content });
      }}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2"
    >
      <PatientNotice />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="年月">
          <MonthInput value={ym} onChange={setYm} />
        </Field>
        <Field label="種別">
          <select value={kind} onChange={(e) => setKind(e.target.value as ClinicEvent["kind"])} className={INPUT}>
            {EVENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="内容">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} className={TEXTAREA} required />
      </Field>
      <FormActions busy={busy} onCancel={onCancel} submitLabel={initial ? "💾 更新" : "＋ 出来事を登録"} />
    </form>
  );
}

// ─── 施策 ───

function InitiativeForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Initiative | null;
  busy: boolean;
  onSubmit: SubmitFn;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [plannedYm, setPlannedYm] = useState(initial?.plannedYm ?? "");
  const [doneYm, setDoneYm] = useState(initial?.doneYm ?? "");
  const [status, setStatus] = useState<Initiative["status"]>(initial?.status ?? "planned");
  const [quadrant, setQuadrant] = useState<number>(initial?.quadrant ?? 0);
  const [aim, setAim] = useState(initial?.aim ?? "");
  const [result, setResult] = useState(initial?.result ?? "");
  const [learning, setLearning] = useState(initial?.learning ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ name, plannedYm, doneYm, status, quadrant, aim, result, learning });
      }}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2"
    >
      <PatientNotice />
      <Field label="施策名">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} required />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="計画した時期">
          <MonthInput value={plannedYm} onChange={setPlannedYm} />
        </Field>
        <Field label="実施した時期" hint="未実施は空欄">
          <MonthInput value={doneYm} onChange={setDoneYm} />
        </Field>
        <Field label="状態" hint="「未完了」「中止」も同じ重さで記録する">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Initiative["status"])}
            className={INPUT}
          >
            {INITIATIVE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="四象限" hint="どの領域の仕事だったか">
          <select value={quadrant} onChange={(e) => setQuadrant(Number(e.target.value))} className={INPUT}>
            <option value={0}>（未設定）</option>
            {([1, 2, 3, 4] as const).map((q) => (
              <option key={q} value={q}>
                {QUADRANT_LABELS[q]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="狙い" hint="何のためにやったか">
        <textarea value={aim} onChange={(e) => setAim(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="結果" hint="どうなったか">
        <textarea value={result} onChange={(e) => setResult(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="学び" hint="何が分かったか、次にどう活かすか">
        <textarea value={learning} onChange={(e) => setLearning(e.target.value)} className={TEXTAREA} />
      </Field>
      <FormActions busy={busy} onCancel={onCancel} submitLabel={initial ? "💾 更新" : "＋ 施策を登録"} />
    </form>
  );
}

// ─── 時間管理スナップショット ───

type ShareKey = "q1" | "q2" | "q3" | "q4";
const SHARE_KEYS: ShareKey[] = ["q1", "q2", "q3", "q4"];

function toInt(s: string): number {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function SnapshotForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Snapshot | null;
  busy: boolean;
  onSubmit: SubmitFn;
  onCancel: () => void;
}) {
  const [recordedMode, setRecordedMode] = useState<Snapshot["recordedMode"]>(
    initial?.recordedMode ?? "retrospective"
  );
  const [method, setMethod] = useState(initial?.method ?? "");
  const [reality, setReality] = useState(initial?.reality ?? "");
  const [shares, setShares] = useState<Record<ShareKey, string>>({
    q1: initial?.shares ? String(initial.shares.q1) : "",
    q2: initial?.shares ? String(initial.shares.q2) : "",
    q3: initial?.shares ? String(initial.shares.q3) : "",
    q4: initial?.shares ? String(initial.shares.q4) : "",
  });
  const [timeThief, setTimeThief] = useState(initial?.timeThief ?? "");
  const [focus, setFocus] = useState(initial?.focus ?? "");
  const [wentWrong, setWentWrong] = useState(initial?.wentWrong ?? "");
  const [wentWell, setWentWell] = useState(initial?.wentWell ?? "");
  const [feeling, setFeeling] = useState(initial?.feeling ?? "");

  const allEmpty = SHARE_KEYS.every((k) => shares[k].trim() === "");
  const nums = SHARE_KEYS.map((k) => toInt(shares[k]));
  const invalid = nums.some((n) => Number.isNaN(n));
  const sum = invalid ? NaN : nums.reduce((a, b) => a + b, 0);
  const remaining = invalid ? NaN : 100 - sum;

  const fillRemaining = (k: ShareKey) => {
    if (invalid || remaining <= 0) return;
    setShares((prev) => ({ ...prev, [k]: String(toInt(prev[k]) + remaining) }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          recordedMode,
          method,
          reality,
          // 4つとも空なら「未入力」として null を送る（グラフに載せない）
          shares: allEmpty
            ? null
            : { q1: toInt(shares.q1), q2: toInt(shares.q2), q3: toInt(shares.q3), q4: toInt(shares.q4) },
          timeThief,
          focus,
          wentWrong,
          wentWell,
          feeling,
        });
      }}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2"
    >
      <PatientNotice />
      <Field label="この記録は" hint="後から思い出して書いたものと、当時書いたものを区別します">
        <div className="flex flex-wrap gap-2">
          {RECORDED_MODES.map((m) => (
            <label
              key={m.value}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs min-h-[40px] cursor-pointer ${
                recordedMode === m.value
                  ? "border-teal bg-teal-light text-teal font-medium"
                  : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              <input
                type="radio"
                name="recordedMode"
                value={m.value}
                checked={recordedMode === m.value}
                onChange={() => setRecordedMode(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="当時の方法" hint="手帳・ツール・ルーティンなど">
        <textarea value={method} onChange={(e) => setMethod(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="当時の実情" hint="実際はどうだったか">
        <textarea value={reality} onChange={(e) => setReality(e.target.value)} className={TEXTAREA} />
      </Field>

      <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2">
        <p className="text-[11px] font-medium text-gray-700">
          四象限の配分（%）
          <span className="ml-1 text-gray-400 font-normal">推定値でよい。合計100%になるように</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([1, 2, 3, 4] as const).map((q) => {
            const k = `q${q}` as ShareKey;
            return (
              <div key={k} className="flex items-end gap-1.5">
                <Field label={QUADRANT_LABELS[q]}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={shares[k]}
                    onChange={(e) => setShares((prev) => ({ ...prev, [k]: e.target.value }))}
                    className={INPUT}
                    placeholder="0"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => fillRemaining(k)}
                  disabled={invalid || remaining <= 0}
                  title="残りの%をこの象限に充てる"
                  className={`${BTN_SMALL} shrink-0 whitespace-nowrap min-h-[44px]`}
                >
                  残りを充てる
                </button>
              </div>
            );
          })}
        </div>
        <p
          className={`text-[11px] ${
            allEmpty
              ? "text-gray-500"
              : invalid
                ? "text-red-700"
                : sum === 100
                  ? "text-teal-700"
                  : "text-amber-700"
          }`}
        >
          {allEmpty
            ? "未入力（グラフには載りません）"
            : invalid
              ? "0以上の整数で入力してください"
              : sum === 100
                ? "✅ 合計 100%"
                : sum < 100
                  ? `合計 ${sum}%（あと ${remaining}%）`
                  : `合計 ${sum}%（${sum - 100}% 超過）`}
        </p>
      </div>

      <Field label="最も時間を奪われていたこと">
        <textarea value={timeThief} onChange={(e) => setTimeThief(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="注力していたこと">
        <textarea value={focus} onChange={(e) => setFocus(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="うまくいかなかったこと">
        <textarea value={wentWrong} onChange={(e) => setWentWrong(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="うまくいったこと">
        <textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} className={TEXTAREA} />
      </Field>
      <Field label="当時の気持ち" hint="自由記述">
        <textarea value={feeling} onChange={(e) => setFeeling(e.target.value)} className={TEXTAREA} />
      </Field>
      <FormActions
        busy={busy}
        onCancel={onCancel}
        submitLabel={initial ? "💾 更新" : "＋ スナップショットを登録"}
      />
    </form>
  );
}

// ─── 権限委譲 ───

function DelegationForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Delegation | null;
  busy: boolean;
  onSubmit: SubmitFn;
  onCancel: () => void;
}) {
  const [task, setTask] = useState(initial?.task ?? "");
  const [status, setStatus] = useState<Delegation["status"]>(initial?.status ?? "held");
  const [toRole, setToRole] = useState(initial?.toRole ?? "");
  const [toName, setToName] = useState(initial?.toName ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ task, status, toRole, toName, memo });
      }}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2"
    >
      <PatientNotice />
      <p className="text-[11px] text-gray-600 leading-relaxed">
        記録するのは<strong>業務の移り変わり</strong>であり、人の評価ではありません。委譲先は役割で記録します（氏名は任意）。
      </p>
      <Field label="業務" hint="例: シフト作成、採用面接、発注、教育">
        <input value={task} onChange={(e) => setTask(e.target.value)} className={INPUT} required />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="状態">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Delegation["status"])}
            className={INPUT}
          >
            {DELEGATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="委譲先（役割）" hint="例: 主任、医療事務">
          <input value={toRole} onChange={(e) => setToRole(e.target.value)} className={INPUT} />
        </Field>
        <Field label="委譲先（氏名）" hint="任意。匿名化出力では消えます">
          <input value={toName} onChange={(e) => setToName(e.target.value)} className={INPUT} />
        </Field>
      </div>
      <Field label="備考">
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className={TEXTAREA} />
      </Field>
      <FormActions busy={busy} onCancel={onCancel} submitLabel={initial ? "💾 更新" : "＋ 権限委譲を登録"} />
    </form>
  );
}

// ─── 期のカード（4種類の記録をまとめる）───

function Para({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">
      <span className="text-gray-500">{label}: </span>
      {value}
    </p>
  );
}

function RowActions({
  canEdit,
  busy,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex gap-1.5 shrink-0">
      <button type="button" onClick={onEdit} disabled={busy} className={BTN_SMALL}>
        ✏️ 編集
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className={`${BTN_SMALL} border-red-200 text-red-700 hover:bg-red-50`}
      >
        🗑
      </button>
    </div>
  );
}

function SubSection({
  title,
  count,
  open,
  onToggle,
  addLabel,
  onAdd,
  canEdit,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  addLabel: string;
  onAdd?: () => void;
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 min-h-[36px] text-left"
        >
          <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
          {title}
          <span className="text-[11px] text-gray-500 font-normal">（{count}件）</span>
        </button>
        {canEdit && onAdd && (
          <button type="button" onClick={onAdd} className={BTN_SMALL}>
            {addLabel}
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </section>
  );
}

type Editing = { kind: RecordKind; id: string } | null;

function PeriodCard({
  period,
  data,
  isAdmin,
  busy,
  open,
  onToggle,
  onSave,
  onDelete,
}: {
  period: Period;
  data: RetrospectiveData;
  isAdmin: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onSave: (kind: RecordKind, id: string | null, input: RecordInput) => Promise<boolean>;
  onDelete: (kind: RecordKind, id: string, label: string, extra?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    event: true,
    snapshot: true,
    initiative: true,
    delegation: true,
  });
  const toggle = (k: string) => setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  const events = useMemo(
    () => sortEvents(data.events.filter((e) => e.periodId === period.id)),
    [data.events, period.id]
  );
  const initiatives = useMemo(
    () => sortInitiatives(data.initiatives.filter((i) => i.periodId === period.id)),
    [data.initiatives, period.id]
  );
  const delegations = useMemo(
    () => sortDelegations(data.delegations.filter((d) => d.periodId === period.id)),
    [data.delegations, period.id]
  );
  const snapshot = useMemo(
    () => snapshotOfPeriod(data.snapshots, period.id),
    [data.snapshots, period.id]
  );

  const submitFor =
    (kind: RecordKind, id: string | null): SubmitFn =>
    async (input) => {
      const ok = await onSave(kind, id, { ...input, periodId: period.id });
      if (ok) setEditing(null);
    };
  const isEditing = (kind: RecordKind, id: string) =>
    editing?.kind === kind && editing.id === id;

  const childCount = events.length + initiatives.length + delegations.length + (snapshot ? 1 : 0);

  return (
    <article className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 bg-gray-50">
        <button
          type="button"
          onClick={onToggle}
          className="text-left flex-1 min-w-0 min-h-[40px]"
        >
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
            {period.name}
          </p>
          <p className="text-[11px] text-gray-500">
            {periodRangeLabel(period)}
            {!open && childCount > 0 && <span className="ml-2">記録 {childCount}件</span>}
          </p>
        </button>
        <RowActions
          canEdit={isAdmin}
          busy={busy}
          onEdit={() => setEditing({ kind: "period", id: period.id })}
          onDelete={() =>
            void onDelete(
              "period",
              period.id,
              `期「${period.name}」`,
              childCount > 0
                ? `この期に属する記録 ${childCount}件（出来事・スナップショット・施策・権限委譲）も一緒に消えます。`
                : undefined
            )
          }
        />
      </div>

      {isEditing("period", period.id) && (
        <div className="p-3">
          <PeriodForm
            initial={period}
            busy={busy}
            onSubmit={submitFor("period", period.id)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {open && (
        <div className="p-3 space-y-2">
          {period.summary.trim() && (
            <p className="text-[12px] text-gray-800 leading-relaxed whitespace-pre-wrap">
              {period.summary}
            </p>
          )}

          {/* 出来事 */}
          <SubSection
            title="📜 出来事"
            count={events.length}
            open={openSections.event}
            onToggle={() => toggle("event")}
            addLabel="＋ 追加"
            onAdd={() => setEditing({ kind: "event", id: "new" })}
            canEdit={isAdmin}
          >
            {isEditing("event", "new") && (
              <EventForm
                initial={null}
                busy={busy}
                onSubmit={submitFor("event", null)}
                onCancel={() => setEditing(null)}
              />
            )}
            {events.length === 0 && !isEditing("event", "new") && (
              <p className="text-[11px] text-gray-500">まだ記録はありません。</p>
            )}
            {events.map((e) =>
              isEditing("event", e.id) ? (
                <EventForm
                  key={e.id}
                  initial={e}
                  busy={busy}
                  onSubmit={submitFor("event", e.id)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={e.id} className="flex items-start justify-between gap-2 border-t border-gray-100 pt-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-500">
                      <span className="tabular-nums">{e.ym}</span>
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {eventKindLabel(e.kind)}
                      </span>
                    </p>
                    <p className="text-[12px] text-gray-800 leading-relaxed whitespace-pre-wrap">{e.content}</p>
                  </div>
                  <RowActions
                    canEdit={isAdmin}
                    busy={busy}
                    onEdit={() => setEditing({ kind: "event", id: e.id })}
                    onDelete={() => void onDelete("event", e.id, `出来事「${e.ym} ${e.content.slice(0, 20)}」`)}
                  />
                </div>
              )
            )}
          </SubSection>

          {/* 時間管理スナップショット */}
          <SubSection
            title="⏱ 時間管理スナップショット"
            count={snapshot ? 1 : 0}
            open={openSections.snapshot}
            onToggle={() => toggle("snapshot")}
            addLabel="＋ 記入"
            onAdd={snapshot ? undefined : () => setEditing({ kind: "snapshot", id: "new" })}
            canEdit={isAdmin}
          >
            {isEditing("snapshot", "new") && !snapshot && (
              <SnapshotForm
                initial={null}
                busy={busy}
                onSubmit={submitFor("snapshot", null)}
                onCancel={() => setEditing(null)}
              />
            )}
            {!snapshot && !isEditing("snapshot", "new") && (
              <p className="text-[11px] text-gray-500">
                まだ記入されていません。四象限の配分を入力すると推移グラフに反映されます。
              </p>
            )}
            {snapshot &&
              (isEditing("snapshot", snapshot.id) ? (
                <SnapshotForm
                  initial={snapshot}
                  busy={busy}
                  onSubmit={submitFor("snapshot", snapshot.id)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px]">
                      <span
                        className={`px-1.5 py-0.5 rounded border ${
                          snapshot.recordedMode === "contemporaneous"
                            ? "bg-teal-50 text-teal-800 border-teal-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {recordedModeLabel(snapshot.recordedMode)}
                      </span>
                      <span className="ml-2 text-gray-700">
                        {snapshot.shares
                          ? `第1 ${snapshot.shares.q1}% ／ 第2 ${snapshot.shares.q2}% ／ 第3 ${snapshot.shares.q3}% ／ 第4 ${snapshot.shares.q4}%`
                          : "四象限の配分: 未入力"}
                      </span>
                    </p>
                    <RowActions
                      canEdit={isAdmin}
                      busy={busy}
                      onEdit={() => setEditing({ kind: "snapshot", id: snapshot.id })}
                      onDelete={() => void onDelete("snapshot", snapshot.id, "時間管理スナップショット")}
                    />
                  </div>
                  <Para label="当時の方法" value={snapshot.method} />
                  <Para label="当時の実情" value={snapshot.reality} />
                  <Para label="最も時間を奪われていたこと" value={snapshot.timeThief} />
                  <Para label="注力していたこと" value={snapshot.focus} />
                  <Para label="うまくいかなかったこと" value={snapshot.wentWrong} />
                  <Para label="うまくいったこと" value={snapshot.wentWell} />
                  <Para label="当時の気持ち" value={snapshot.feeling} />
                </div>
              ))}
          </SubSection>

          {/* 施策 */}
          <SubSection
            title="🎯 施策"
            count={initiatives.length}
            open={openSections.initiative}
            onToggle={() => toggle("initiative")}
            addLabel="＋ 追加"
            onAdd={() => setEditing({ kind: "initiative", id: "new" })}
            canEdit={isAdmin}
          >
            {isEditing("initiative", "new") && (
              <InitiativeForm
                initial={null}
                busy={busy}
                onSubmit={submitFor("initiative", null)}
                onCancel={() => setEditing(null)}
              />
            )}
            {initiatives.length === 0 && !isEditing("initiative", "new") && (
              <p className="text-[11px] text-gray-500">まだ記録はありません。</p>
            )}
            {initiatives.map((i) =>
              isEditing("initiative", i.id) ? (
                <InitiativeForm
                  key={i.id}
                  initial={i}
                  busy={busy}
                  onSubmit={submitFor("initiative", i.id)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={i.id} className="border-t border-gray-100 pt-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-gray-900">{i.name}</p>
                      <p className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                        <span className={`px-1.5 py-0.5 rounded ${STATUS_BADGE[i.status]}`}>
                          {initiativeStatusLabel(i.status)}
                        </span>
                        {i.quadrant ? <span>{quadrantShortLabel(i.quadrant)}</span> : null}
                        <span>計画 {i.plannedYm || "—"} ／ 実施 {i.doneYm || "—"}</span>
                      </p>
                    </div>
                    <RowActions
                      canEdit={isAdmin}
                      busy={busy}
                      onEdit={() => setEditing({ kind: "initiative", id: i.id })}
                      onDelete={() => void onDelete("initiative", i.id, `施策「${i.name}」`)}
                    />
                  </div>
                  <Para label="狙い" value={i.aim} />
                  <Para label="結果" value={i.result} />
                  <Para label="学び" value={i.learning} />
                </div>
              )
            )}
          </SubSection>

          {/* 権限委譲 */}
          <SubSection
            title="🤝 権限委譲"
            count={delegations.length}
            open={openSections.delegation}
            onToggle={() => toggle("delegation")}
            addLabel="＋ 追加"
            onAdd={() => setEditing({ kind: "delegation", id: "new" })}
            canEdit={isAdmin}
          >
            {isEditing("delegation", "new") && (
              <DelegationForm
                initial={null}
                busy={busy}
                onSubmit={submitFor("delegation", null)}
                onCancel={() => setEditing(null)}
              />
            )}
            {delegations.length === 0 && !isEditing("delegation", "new") && (
              <p className="text-[11px] text-gray-500">まだ記録はありません。</p>
            )}
            {delegations.map((d) =>
              isEditing("delegation", d.id) ? (
                <DelegationForm
                  key={d.id}
                  initial={d}
                  busy={busy}
                  onSubmit={submitFor("delegation", d.id)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={d.id} className="border-t border-gray-100 pt-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-gray-900">{d.task}</p>
                      <p className="text-[11px] text-gray-600 flex flex-wrap gap-x-2">
                        <span className={`px-1.5 py-0.5 rounded ${DELEGATION_BADGE[d.status]}`}>
                          {delegationStatusLabel(d.status)}
                        </span>
                        {(d.toRole || d.toName) && (
                          <span>
                            → {d.toRole}
                            {d.toName ? `（${d.toName}）` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <RowActions
                      canEdit={isAdmin}
                      busy={busy}
                      onEdit={() => setEditing({ kind: "delegation", id: d.id })}
                      onDelete={() => void onDelete("delegation", d.id, `権限委譲「${d.task}」`)}
                    />
                  </div>
                  <Para label="備考" value={d.memo} />
                </div>
              )
            )}
          </SubSection>
        </div>
      )}
    </article>
  );
}

const STATUS_BADGE: Record<Initiative["status"], string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-100 text-sky-800",
  done: "bg-teal-100 text-teal-800",
  incomplete: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
};

const DELEGATION_BADGE: Record<Delegation["status"], string> = {
  held: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
  full: "bg-teal-100 text-teal-800",
};

// ─── 発表用の出力（173-4）───

function ExportPanel({ periods, busy }: { periods: Period[]; busy: boolean }) {
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = 全期
  const [anonymize, setAnonymize] = useState(true); // 既定ON（173-4-2）
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const isChecked = (id: string) => selected === null || selected.has(id);
  const toggle = (id: string) => {
    setSelected((prev) => {
      const base = prev ? new Set(prev) : new Set(periods.map((p) => p.id));
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  const count = selected === null ? periods.length : periods.filter((p) => selected.has(p.id)).length;

  const download = async () => {
    setWorking(true);
    setError("");
    setDone("");
    try {
      const ids = selected === null ? null : periods.filter((p) => selected.has(p.id)).map((p) => p.id);
      if (ids && ids.length === 0) throw new Error("出力する期を1つ以上選んでください");
      const { text, filename } = await fetchRetrospectiveMarkdown({ periodIds: ids, anonymize });
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(`📄 ${filename} をダウンロードしました`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "出力に失敗しました");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <h2 className="text-sm font-medium text-gray-900">📤 発表用の出力（Markdown）</h2>
      <p className="text-[11px] text-gray-600 leading-relaxed">
        選んだ期を時系列の1本のMarkdownにします（期ごとに 出来事 → 時間管理スナップショット → 施策 → 権限委譲）。
        ダウンロードはこのボタンからだけ始まります。
      </p>
      {periods.length === 0 ? (
        <p className="text-[11px] text-gray-500">期を登録すると出力できます。</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`${BTN_SMALL} ${selected === null ? "border-teal bg-teal-light text-teal" : ""}`}
            >
              全期
            </button>
            {sortPeriods(periods).map((p) => (
              <label
                key={p.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] min-h-[32px] cursor-pointer ${
                  isChecked(p.id) ? "border-teal bg-teal-light text-teal" : "border-gray-300 text-gray-700"
                }`}
              >
                <input type="checkbox" checked={isChecked(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2 text-[11px] text-gray-800 min-h-[36px]">
            <input
              type="checkbox"
              checked={anonymize}
              onChange={(e) => setAnonymize(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>スタッフの氏名を役割に置き換える</strong>（既定ON）。
              委譲先・出来事・自由記述に含まれる登録済みスタッフの氏名を役割名に置換し、委譲先の氏名欄は空にします。
              セミナー発表など外部に出すときはONのままにしてください。
            </span>
          </label>
          {!anonymize && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              匿名化OFF: スタッフの氏名がそのまま出力されます。外部公開には使わないでください。
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={download} disabled={busy || working} className={BTN_PRIMARY}>
              {working ? "作成中…" : `⬇️ Markdownをダウンロード（${count}期）`}
            </button>
            {done && <span className="text-[11px] text-teal-800">{done}</span>}
          </div>
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}
        </>
      )}
    </section>
  );
}

// ─── 本体 ───

function upsertRecord(data: RetrospectiveData, rec: RetrospectiveRecord): RetrospectiveData {
  const replace = <T extends { id: string }>(list: T[], item: T): T[] =>
    list.some((x) => x.id === item.id)
      ? list.map((x) => (x.id === item.id ? item : x))
      : [...list, item];
  switch (rec.kind) {
    case "period":
      return { ...data, periods: replace(data.periods, rec.record) };
    case "event":
      return { ...data, events: replace(data.events, rec.record) };
    case "initiative":
      return { ...data, initiatives: replace(data.initiatives, rec.record) };
    case "snapshot":
      return { ...data, snapshots: replace(data.snapshots, rec.record) };
    case "delegation":
      return { ...data, delegations: replace(data.delegations, rec.record) };
  }
}

function removeRecord(data: RetrospectiveData, kind: RecordKind, id: string): RetrospectiveData {
  if (kind === "period") {
    return {
      periods: data.periods.filter((p) => p.id !== id),
      events: data.events.filter((e) => e.periodId !== id),
      initiatives: data.initiatives.filter((i) => i.periodId !== id),
      snapshots: data.snapshots.filter((s) => s.periodId !== id),
      delegations: data.delegations.filter((d) => d.periodId !== id),
    };
  }
  const drop = <T extends { id: string }>(list: T[]) => list.filter((x) => x.id !== id);
  switch (kind) {
    case "event":
      return { ...data, events: drop(data.events) };
    case "initiative":
      return { ...data, initiatives: drop(data.initiatives) };
    case "snapshot":
      return { ...data, snapshots: drop(data.snapshots) };
    case "delegation":
      return { ...data, delegations: drop(data.delegations) };
  }
}

export function DirectorRetrospectiveBoard({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<RetrospectiveData>(emptyRetrospectiveData());
  const [tableMissing, setTableMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingPeriod, setAddingPeriod] = useState(false);
  /** 開いている期。null = 未操作（最新の期を開く） */
  const [openPeriods, setOpenPeriods] = useState<Set<string> | null>(null);
  const [showCharts, setShowCharts] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const json = await fetchRetrospective();
      setData({
        periods: json.periods,
        events: json.events,
        initiatives: json.initiatives,
        snapshots: json.snapshots,
        delegations: json.delegations,
      });
      setTableMissing(json.tableMissing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const periods = useMemo(() => sortPeriods(data.periods), [data.periods]);
  const quadrantRows = useMemo(() => buildQuadrantChartRows(data), [data]);
  const delegationRows = useMemo(() => buildDelegationChartRows(data), [data]);
  const initiativeRows = useMemo(() => buildInitiativeStatusRows(data), [data]);

  const isOpen = (id: string) =>
    openPeriods ? openPeriods.has(id) : periods.length > 0 && periods[periods.length - 1].id === id;
  const togglePeriod = (id: string) =>
    setOpenPeriods((prev) => {
      const base = prev
        ? new Set(prev)
        : new Set(periods.length > 0 ? [periods[periods.length - 1].id] : []);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });

  const flash = (text: string) => {
    setMsg(text);
    setError("");
  };

  const save = async (kind: RecordKind, id: string | null, input: RecordInput): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      const rec = id
        ? await patchRetrospectiveRecord(kind, id, input)
        : await createRetrospectiveRecord(kind, input);
      setData((prev) => upsertRecord(prev, rec));
      if (kind === "period" && !id) {
        setOpenPeriods((prev) => {
          const base = prev ? new Set(prev) : new Set<string>();
          base.add(rec.record.id);
          return base;
        });
      }
      flash(id ? "💾 更新しました" : "💾 登録しました");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind: RecordKind, id: string, label: string, extra?: string) => {
    if (
      !confirm(
        `${label} を削除します。\n\n${extra ? `${extra}\n\n` : ""}削除すると元に戻せません。よろしいですか？`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteRetrospectiveRecord(kind, id);
      setData((prev) => removeRecord(prev, kind, id));
      flash("🗑 削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (tableMissing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-gray-900">
            🧭 院長の振り返り記録の準備がまだ終わっていません
          </p>
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
            データの保存先（テーブル）がまだ作られていません。
            <code className="mx-1">~/Downloads/173_院長の振り返り記録_テーブル作成.sql</code>
            を Supabase の SQL Editor で実行してください。
            実行後にこのページを再読み込みすると使えるようになります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <header>
        <h1 className="text-lg font-bold text-gray-900">🧭 院長の振り返り記録</h1>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          開業から現在までを期ごとに記録し、施策の流れ・時間管理の変化・権限委譲の推移を振り返るための記録です。
          <strong>この画面は管理者だけが開けます。</strong>
        </p>
      </header>

      {/* 173-4-3: 入力欄の上に常時表示 */}
      <div className="sticky top-0 z-10">
        <PatientNotice />
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
      )}

      {/* 見える化（173-3） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <button
          type="button"
          onClick={() => setShowCharts((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 min-h-[36px]"
        >
          <span className="text-gray-400 text-xs">{showCharts ? "▾" : "▸"}</span>
          📊 見える化
        </button>
        {showCharts && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[12px] font-medium text-gray-800 mb-1">四象限の配分の推移</h3>
              <QuadrantTrendChart rows={quadrantRows} />
            </div>
            <div>
              <h3 className="text-[12px] font-medium text-gray-800 mb-1">権限委譲の推移</h3>
              <DelegationTrendChart rows={delegationRows} />
            </div>
            <div>
              <h3 className="text-[12px] font-medium text-gray-800 mb-1">施策の状態一覧</h3>
              <InitiativeStatusTable rows={initiativeRows} />
            </div>
          </div>
        )}
      </section>

      {/* 期 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">🗂 期（{periods.length}）</h2>
          {isAdmin && !addingPeriod && (
            <button type="button" onClick={() => setAddingPeriod(true)} className={BTN_SMALL}>
              ＋ 期を追加
            </button>
          )}
        </div>
        {addingPeriod && (
          <PeriodForm
            initial={null}
            busy={busy}
            onSubmit={async (input) => {
              const ok = await save("period", null, input);
              if (ok) setAddingPeriod(false);
            }}
            onCancel={() => setAddingPeriod(false)}
          />
        )}
        {loaded && periods.length === 0 && !addingPeriod && (
          <p className="text-[11px] text-gray-500 rounded-xl border border-dashed border-gray-300 p-4 text-center">
            まだ期がありません。「＋ 期を追加」から、例えば「2022 開業期」のように自由に定義してください。
          </p>
        )}
        {periods.map((p) => (
          <PeriodCard
            key={p.id}
            period={p}
            data={data}
            isAdmin={isAdmin}
            busy={busy}
            open={isOpen(p.id)}
            onToggle={() => togglePeriod(p.id)}
            onSave={save}
            onDelete={remove}
          />
        ))}
      </section>

      {isAdmin && <ExportPanel periods={periods} busy={busy} />}

      {isAdmin && (
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 min-h-[36px]"
          >
            <span className="text-gray-400 text-xs">{showLogs ? "▾" : "▸"}</span>
            🗂 操作ログ
          </button>
          {showLogs && (
            <div className="mt-2">
              <DirectorRetrospectiveLogsPanel />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
