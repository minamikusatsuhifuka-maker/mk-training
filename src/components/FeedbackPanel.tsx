"use client";

// ポジティブ／ギャップフィードバックの記録（指示書185 B/C）
// - mode="recorder": 院長・担当幹部。担当スタッフについて記録・編集・削除（幹部は自分の記録だけ見える＝サーバーが絞る）
// - mode="owner": 本人。もらった承認（全項目）とギャップFB（①②③・その後）を読み、反応（ポジティブ）／改善計画の進捗（ギャップ）を書く。
//   一覧を開いたら「見た」印をサーバーに残す（新しい記録の印は親が数える）
// 人物評価・性格の断定の欄、本人に見せないメモ欄は**無い**（型にも画面にも存在しない・C-2）。

import { useCallback, useEffect, useState } from "react";
import {
  APPROVAL_KINDS,
  GAP_FEEDBACK_NOTICE_1,
  GAP_FEEDBACK_NOTICE_2,
  INSIDE_OUT_PROMPT,
  POSITIVE_FEEDBACK_NOTICE,
  VIEWPOINT_KEYS,
  isFeedbackUnseen,
  viewpointLabel,
  type ApprovalKind,
  type Feedback,
  type FeedbackType,
  type ViewpointKey,
} from "@/lib/staff-growth";
import {
  createFeedbackApi,
  deleteFeedbackApi,
  fetchFeedbackApi,
  markFeedbackSeenApi,
  patchFeedbackApi,
  type FeedbackAuthorInput,
} from "@/lib/staff-growth-client";
import { useDraft, DISCARD_CONFIRM } from "@/lib/retro-drafts";

const APPROVAL_LABEL = Object.fromEntries(APPROVAL_KINDS.map((k) => [k.value, k.label])) as Record<ApprovalKind, string>;

export function FeedbackPanel({
  mode,
  userId,
  staffName,
  onLoaded,
}: {
  mode: "owner" | "recorder";
  /** recorder のとき対象のスタッフ */
  userId?: string;
  staffName?: string;
  /** owner: 読み込み後に呼ぶ（未読件数の印を消す用） */
  onLoaded?: (feedback: Feedback[]) => void;
}) {
  const [list, setList] = useState<Feedback[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [serverMode, setServerMode] = useState<"owner" | "admin" | "delegate">("owner");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<FeedbackType | "">("");
  const [editing, setEditing] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await fetchFeedbackApi(mode === "recorder" ? userId : undefined);
      setList(j.feedback);
      setViewerId(j.viewerId);
      setServerMode(j.mode);
      onLoaded?.(j.feedback);
      if (mode === "owner" && j.feedback.some(isFeedbackUnseen)) {
        await markFeedbackSeenApi().catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, [mode, userId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };
  const replace = (f: Feedback) => setList((prev) => prev.map((x) => (x.id === f.id ? f : x)));

  const create = async (input: FeedbackAuthorInput): Promise<string | null> => {
    if (!userId) return "対象が不明です";
    setBusy(true);
    try {
      const { feedback } = await createFeedbackApi(userId, input);
      setList((prev) => [feedback, ...prev]);
      setCreating("");
      flash(input.type === "gap" ? "📝 ギャップフィードバックを記録しました（本人にも見えます）" : "🌟 ポジティブフィードバックを記録しました（本人にも見えます）");
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "記録に失敗しました";
    } finally {
      setBusy(false);
    }
  };
  const patch = async (id: string, input: Parameters<typeof patchFeedbackApi>[1]): Promise<string | null> => {
    setBusy(true);
    try {
      const { feedback } = await patchFeedbackApi(id, input);
      replace(feedback);
      setEditing("");
      flash("💾 保存しました");
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "保存に失敗しました";
    } finally {
      setBusy(false);
    }
  };
  const remove = async (f: Feedback) => {
    if (!confirm(`${f.date.replaceAll("-", "/")} の${f.type === "gap" ? "ギャップ" : "ポジティブ"}フィードバックを削除します（本人にも見えなくなります・操作ログに残ります）。よろしいですか？`)) return;
    setBusy(true);
    try {
      await deleteFeedbackApi(f.id);
      setList((prev) => prev.filter((x) => x.id !== f.id));
      flash("🗑 削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="feedback" className="space-y-2" data-feedback-panel data-mode={mode}>
      {mode === "recorder" && (
        <>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            {staffName ? `${staffName} さんへの` : ""}フィードバックの記録。<strong>記録した内容は本人にも見えます。</strong>
            {serverMode === "delegate" ? " ここに出るのはあなたが記録したものだけです（院長・他の幹部の記録は見えません）。" : ""}
          </p>
          {creating === "" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCreating("positive")} className="px-3 py-2 bg-amber-500 text-white rounded-full text-xs hover:bg-amber-600 min-h-[40px]">
                🌟 ポジティブフィードバックを記録
              </button>
              <button type="button" onClick={() => setCreating("gap")} className="px-3 py-2 bg-slate-700 text-white rounded-full text-xs hover:bg-slate-800 min-h-[40px]">
                📝 ギャップフィードバックを記録
              </button>
            </div>
          ) : (
            <FeedbackEditor key={`new-${creating}`} draftKey={`growth:feedback:${userId}:new:${creating}`} type={creating} initial={null} busy={busy} onCancel={() => setCreating("")} onSubmit={(v) => create({ ...v, type: creating })} />
          )}
        </>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {!loaded ? (
        <p className="text-[11px] text-gray-500">読み込み中…</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-gray-500">{mode === "owner" ? "まだ記録はありません。" : "まだ記録がありません。"}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((f) =>
            editing === f.id ? (
              <li key={f.id}>
                <FeedbackEditor key={f.id} draftKey={`growth:feedback:${f.userId}:${f.id}`} type={f.type} initial={f} busy={busy} onCancel={() => setEditing("")} onSubmit={(v) => patch(f.id, v)} />
              </li>
            ) : (
              <li key={f.id}>
                <FeedbackCard
                  f={f}
                  mode={mode}
                  canEdit={mode === "recorder" && (serverMode === "admin" || f.authorId === viewerId)}
                  busy={busy}
                  onEdit={() => setEditing(f.id)}
                  onDelete={() => void remove(f)}
                  onOwnerSave={(input) => patch(f.id, input)}
                />
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}

function FeedbackCard({
  f,
  mode,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onOwnerSave,
}: {
  f: Feedback;
  mode: "owner" | "recorder";
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOwnerSave: (input: { reaction?: string; progress?: string }) => Promise<string | null>;
}) {
  const [reaction, setReaction] = useState(f.reaction);
  const [progress, setProgress] = useState(f.progress);
  const [err, setErr] = useState("");
  const positive = f.type === "positive";
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${positive ? "border-amber-200 bg-amber-50/40" : "border-slate-300 bg-slate-50/60"}`} data-feedback-card data-type={f.type}>
      <p className="text-[11px] text-gray-600">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${positive ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"}`}>{positive ? "🌟 ポジティブ" : "📝 ギャップ"}</span>
        {f.date.replaceAll("-", "/")}
        {f.authorName ? ` ・ ${f.authorName}` : ""}
        {mode === "owner" && isFeedbackUnseen(f) && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">NEW</span>}
      </p>
      {f.scene && <p className="text-[12px] text-gray-900">場面: {f.scene}</p>}
      {positive ? (
        <>
          {f.approval && <p className="text-[11px] text-gray-700">承認の種類: {APPROVAL_LABEL[f.approval]}</p>}
          <p className="text-[12px] text-gray-900 whitespace-pre-wrap">{f.whatGood}</p>
          {f.viewpoints.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {f.viewpoints.map((k) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-amber-200 text-amber-900">{viewpointLabel(k)}</span>
              ))}
            </p>
          )}
          {mode === "owner" ? (
            <div className="space-y-1 pt-1">
              <label className="block text-[11px] text-gray-700">
                あなたの反応（任意）
                <textarea value={reaction} onChange={(e) => setReaction(e.target.value)} rows={2} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] bg-white mt-0.5" />
              </label>
              <button type="button" disabled={busy || reaction === f.reaction} onClick={async () => setErr((await onOwnerSave({ reaction })) ?? "")} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]">
                💾 反応を保存
              </button>
            </div>
          ) : (
            f.reaction && <p className="text-[11px] text-gray-700">本人の反応: {f.reaction}</p>
          )}
        </>
      ) : (
        <>
          <Step n="①" label="現状（事実）の把握">
            <p className="whitespace-pre-wrap">{f.fact}</p>
            {f.iMessage && <p className="text-gray-700 whitespace-pre-wrap">伝えた側の主観（iメッセージ）: {f.iMessage}</p>}
          </Step>
          {f.issue && (
            <Step n="②" label="問題点のすり合わせ（人ではなく「事」に）">
              <p className="whitespace-pre-wrap">{f.issue}</p>
            </Step>
          )}
          {f.plan && (
            <Step n="③" label="改善計画（本人が考えて決めた）">
              <p className="whitespace-pre-wrap">{f.plan}</p>
              {f.planDue && <p className="text-gray-700">期限: {f.planDue.replaceAll("-", "/")}</p>}
            </Step>
          )}
          {(f.nextCheckOn || f.result) && (
            <Step n="その後" label="">
              {f.nextCheckOn && <p>次回の確認日: {f.nextCheckOn.replaceAll("-", "/")}</p>}
              {f.result && <p className="whitespace-pre-wrap">結果: {f.result}</p>}
            </Step>
          )}
          {mode === "owner" ? (
            <div className="space-y-1 pt-1">
              <label className="block text-[11px] text-gray-700">
                ③の進捗・振り返り（自分で書く）
                <textarea value={progress} onChange={(e) => setProgress(e.target.value)} rows={2} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] bg-white mt-0.5" />
              </label>
              <button type="button" disabled={busy || progress === f.progress} onClick={async () => setErr((await onOwnerSave({ progress })) ?? "")} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]">
                💾 進捗を保存
              </button>
            </div>
          ) : (
            f.progress && <p className="text-[11px] text-gray-700">本人の進捗・振り返り: {f.progress}</p>
          )}
        </>
      )}
      {err && <p className="text-[11px] text-red-700">{err}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onEdit} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]">✏️ 編集</button>
          <button type="button" disabled={busy} onClick={onDelete} className="px-3 py-1.5 border border-red-300 text-red-700 rounded-full text-[11px] hover:bg-red-50 disabled:opacity-40 min-h-[36px]">🗑 削除</button>
        </div>
      )}
    </div>
  );
}

function Step({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-gray-900 border-l-2 border-slate-300 pl-2">
      <p className="text-[10px] text-slate-600">
        {n} {label}
      </p>
      {children}
    </div>
  );
}

type EditorValues = {
  date: string;
  scene: string;
  approval: ApprovalKind | "";
  whatGood: string;
  viewpoints: ViewpointKey[];
  fact: string;
  iMessage: string;
  issue: string;
  plan: string;
  planDue: string;
  nextCheckOn: string;
  result: string;
};

function FeedbackEditor({
  draftKey,
  type,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  draftKey: string;
  type: FeedbackType;
  initial: Feedback | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: FeedbackAuthorInput) => Promise<string | null>;
}) {
  const { values, set, dirty, discard } = useDraft<EditorValues>(draftKey, {
    date: initial?.date ?? "",
    scene: initial?.scene ?? "",
    approval: initial?.approval ?? "",
    whatGood: initial?.whatGood ?? "",
    viewpoints: initial?.viewpoints ?? [],
    fact: initial?.fact ?? "",
    iMessage: initial?.iMessage ?? "",
    issue: initial?.issue ?? "",
    plan: initial?.plan ?? "",
    planDue: initial?.planDue ?? "",
    nextCheckOn: initial?.nextCheckOn ?? "",
    result: initial?.result ?? "",
  });
  const [error, setError] = useState("");
  const positive = type === "positive";
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${positive ? "border-amber-300 bg-amber-50/50" : "border-slate-400 bg-slate-50"}`} data-feedback-editor data-type={type}>
      <p className="text-sm font-medium text-gray-900">{positive ? "🌟 ポジティブフィードバック" : "📝 ギャップフィードバック（3ステップ）"}{dirty ? "（下書きあり）" : ""}</p>
      {/* 入力欄の上に常時表示（B-1／C-2・一言一句そのまま） */}
      {positive ? (
        <p className="text-[11px] text-amber-900 bg-white border border-amber-200 rounded-md p-2" data-notice>{POSITIVE_FEEDBACK_NOTICE}</p>
      ) : (
        <div className="text-[11px] text-slate-900 bg-white border border-slate-300 rounded-md p-2 space-y-0.5" data-notice>
          <p>
            ギャップフィードバックは、<strong>対面で伝え、話し合ったあとに記録します。</strong> アプリで初めて伝えることはしません。
          </p>
          <p>性格や人柄ではなく、事実と「事」について書きます。</p>
          <p className="sr-only">{GAP_FEEDBACK_NOTICE_1} {GAP_FEEDBACK_NOTICE_2}</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[10em_1fr] gap-2">
        <label className="block">
          <span className="text-[11px] text-gray-700">日付（必須）</span>
          <input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} className={inputClass} aria-label="日付" />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-700">場面（事実で）</span>
          <input value={values.scene} onChange={(e) => set("scene", e.target.value)} className={inputClass} aria-label="場面" />
        </label>
      </div>
      {positive ? (
        <>
          <div>
            <span className="text-[11px] text-gray-700">承認の種類</span>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {APPROVAL_KINDS.map((k) => (
                <label key={k.value} className="flex items-center gap-1 text-[12px] text-gray-800 min-h-[36px]">
                  <input type="radio" name={`approval-${draftKey}`} checked={values.approval === k.value} onChange={() => set("approval", k.value)} />
                  {k.label}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] text-gray-700">何が良かったか（必須・背景にある想いや努力まで具体的に）</span>
            <textarea value={values.whatGood} onChange={(e) => set("whatGood", e.target.value)} rows={4} className={areaClass} aria-label="何が良かったか" />
          </label>
          <div>
            <span className="text-[11px] text-gray-700">観点（任意・複数可）: 7つの実／在り方の3本柱／才徳美</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {VIEWPOINT_KEYS.map((k) => (
                <button key={k} type="button" aria-pressed={values.viewpoints.includes(k)} onClick={() => set("viewpoints", values.viewpoints.includes(k) ? values.viewpoints.filter((x) => x !== k) : [...values.viewpoints, k])} className={`text-[11px] px-2 py-1 rounded-full border min-h-[32px] ${values.viewpoints.includes(k) ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-300"}`}>
                  {viewpointLabel(k)}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] text-gray-700">① 現状（事実）の把握: 状況・行動・影響（必須）</span>
            <textarea value={values.fact} onChange={(e) => set("fact", e.target.value)} rows={3} className={areaClass} aria-label="事実" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-700">① 伝えた側の主観（iメッセージ）</span>
            <textarea value={values.iMessage} onChange={(e) => set("iMessage", e.target.value)} rows={2} className={areaClass} placeholder="私は…と感じました" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-700">② 問題点のすり合わせ: 人ではなく「事」に焦点。何が本質だったか</span>
            <textarea value={values.issue} onChange={(e) => set("issue", e.target.value)} rows={3} className={areaClass} aria-label="すり合わせ" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-700">③ 改善計画: 本人が考えて決めた改善策</span>
            <p className="text-[10px] text-slate-600">他責から自責へ（インサイドアウト）: 「{INSIDE_OUT_PROMPT}」</p>
            <textarea value={values.plan} onChange={(e) => set("plan", e.target.value)} rows={3} className={areaClass} aria-label="改善計画" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-gray-700">③ 期限</span>
              <input type="date" value={values.planDue} onChange={(e) => set("planDue", e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-[11px] text-gray-700">その後: 次回の確認日</span>
              <input type="date" value={values.nextCheckOn} onChange={(e) => set("nextCheckOn", e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] text-gray-700">その後: 結果</span>
            <textarea value={values.result} onChange={(e) => set("result", e.target.value)} rows={2} className={areaClass} />
          </label>
        </>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !values.date || (positive ? !values.whatGood.trim() : !values.fact.trim())}
          onClick={async () => {
            const err = await onSubmit({ ...values });
            if (err) setError(err);
            else discard();
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          💾 記録する
        </button>
        <button type="button" disabled={busy} onClick={() => { if (dirty && !confirm(DISCARD_CONFIRM)) return; discard(); onCancel(); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 min-h-[44px]">
          キャンセル
        </button>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white mt-0.5";
const areaClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white mt-0.5";
