"use client";

// 🚨 ヒヤリハット報告（指示書106・機能ID hiyari）
// - 責任追及ではなく仲間と組織を守るための分かち合いの場。報告そのものが称えられる設計。
//   個人別の報告件数・ランキング・並び替えは実装しない（指示書の禁止事項）。
// - 記名基本＋匿名選択可（院長決定）。匿名時は authorId を一切保存しない（真の匿名）。
// - データは content_store hiyari_reports（lib/hiyari-reports.ts）。論理削除。
// - リアクションは既存排他モデルを hiyari_reactions キーで流用。
// - 雛形は /kizuki（指示書104）。既存「気づきシェア」（portal_hiyari）とは別物。

import { useState, useEffect, useCallback, useMemo } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  HIYARI_REACTIONS_KEY,
  HIYARI_TIME_SLOTS,
  HIYARI_PLACES,
  HIYARI_FACTORS,
  HIYARI_LEVELS,
  HIYARI_ROLES,
  hiyariOptionLabel,
  loadHiyariStore,
  saveHiyariStore,
  genHiyariReportId,
  visibleHiyariReports,
  type HiyariReport,
  type HiyariLevel,
} from "@/lib/hiyari-reports";
import HiyariBadges from "@/components/HiyariBadges";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";
import { jstTodayYmd } from "@/lib/library";

// ログイン中の管理者判定（/kizuki・LibraryBrowser と同じ流儀）
function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setIsAdmin(isAdminUser(data.user)))
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAdmin(isAdminUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return isAdmin;
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HiyariReportPageBody() {
  const [posts, setPosts] = useState<HiyariReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false); // 既定はオフ=記名
  const [submitting, setSubmitting] = useState(false);

  // 構造化フィールド（指示書122・必須は「状況の概要」のみ）
  const today = jstTodayYmd();
  const [occurredOn, setOccurredOn] = useState(today); // 既定=今日
  const [timeSlot, setTimeSlot] = useState("");
  const [place, setPlace] = useState("");
  const [placeOther, setPlaceOther] = useState("");
  const [factors, setFactors] = useState<string[]>([]);
  const [factorOther, setFactorOther] = useState("");
  const [level, setLevel] = useState<HiyariLevel | "">("");
  const [countermeasure, setCountermeasure] = useState("");
  const [role, setRole] = useState("");
  // 長文の折りたたみ展開状態（一覧・指示書122）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  const reactions = useNewsReactions(HIYARI_REACTIONS_KEY);
  const myId = reactions.loggedIn ? (reactions.identity?.id ?? "") : "";

  const refresh = useCallback(async () => {
    try {
      const store = await loadHiyariStore();
      setPosts(store.posts);
      setError("");
    } catch {
      setError("読み込みに失敗しました。ページを再読み込みしてください。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(() => visibleHiyariReports(posts), [posts]);

  // 自分の表示名（プロフィール登録名を優先して解決）
  const myName = useMemo(() => {
    if (!reactions.identity) return "";
    return (
      resolveReactorName(reactions.identity, reactions.profileNames) ?? ""
    );
  }, [reactions.identity, reactions.profileNames]);

  const toggleFactor = (value: string) => {
    setFactors((prev) =>
      prev.includes(value)
        ? prev.filter((f) => f !== value)
        : [...prev, value]
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || !myId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const store = await loadHiyariStore();
      const now = new Date().toISOString();
      // 真の匿名: 匿名選択時は authorId フィールド自体を含めない（指示書106・厳守）。
      // 構造化フィールド（指示書122）は選択された時のみ含める。role は記名時のみ
      // （匿名時はフォームで無効化＋ここで除外＋normalize でも破棄の三重ガード）。
      const post: HiyariReport = {
        id: genHiyariReportId(),
        ...(anonymous ? {} : { authorId: myId }),
        authorName: anonymous ? "匿名" : myName,
        body,
        createdAt: now,
        updatedAt: now,
        deleted: false,
        ...(occurredOn ? { occurredOn } : {}),
        ...(timeSlot ? { timeSlot } : {}),
        ...(place ? { place } : {}),
        ...(place === "other" && placeOther.trim()
          ? { placeOther: placeOther.trim() }
          : {}),
        ...(factors.length > 0 ? { factors } : {}),
        ...(factors.includes("other") && factorOther.trim()
          ? { factorOther: factorOther.trim() }
          : {}),
        ...(level ? { level } : {}),
        ...(countermeasure.trim()
          ? { countermeasure: countermeasure.trim() }
          : {}),
        ...(!anonymous && role ? { role } : {}),
      };
      const next = [...store.posts, post];
      const ok = await saveHiyariStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setDraft("");
      setAnonymous(false);
      setOccurredOn(today);
      setTimeSlot("");
      setPlace("");
      setPlaceOther("");
      setFactors([]);
      setFactorOther("");
      setLevel("");
      setCountermeasure("");
      setRole("");
    } catch {
      setError("投稿に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  // 記名投稿は本人＋管理者、匿名投稿は本人判定不可のため管理者のみ
  const canManage = (p: HiyariReport) =>
    isAdmin || (!!myId && !!p.authorId && p.authorId === myId);

  const startEdit = (p: HiyariReport) => {
    setEditingId(p.id);
    setEditDraft(p.body);
  };

  const saveEdit = async () => {
    const body = editDraft.trim();
    if (!editingId || !body || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const store = await loadHiyariStore();
      const next = store.posts.map((p) =>
        p.id === editingId
          ? { ...p, body, updatedAt: new Date().toISOString() }
          : p
      );
      const ok = await saveHiyariStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setEditingId(null);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSavingEdit(false);
    }
  };

  // 確認ダイアログ付きの論理削除（管理画面から復元できる）
  const remove = async (p: HiyariReport) => {
    if (busyId) return;
    if (!confirm("この報告を削除しますか？（管理画面から復元できます）")) return;
    setBusyId(p.id);
    setError("");
    try {
      const store = await loadHiyariStore();
      const next = store.posts.map((x) =>
        x.id === p.id
          ? { ...x, deleted: true, updatedAt: new Date().toISOString() }
          : x
      );
      const ok = await saveHiyariStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
    } catch {
      setError("削除に失敗しました。もう一度お試しください。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 指示書106の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
        ヒヤリとした・ハッとした出来事は、誰かの責任を問うためのものではなく、仲間と組織を守るための大切な贈り物です。事実を中心に、気づいたことを教えてください。報告してくれたことそのものに、感謝のリアクションで応えましょう。
      </p>

      {/* 投稿フォーム（記名基本＋匿名選択可・構造化テンプレート=指示書122。必須は概要のみ） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {/* 1. 発生日＋時間帯 */}
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block font-medium">発生日</span>
            <input
              type="date"
              value={occurredOn}
              max={today}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block font-medium">時間帯</span>
            <select
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">未選択</option>
              {HIYARI_TIME_SLOTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 2. 発生場所（「その他」選択時のみ自由記述） */}
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block font-medium">発生場所</span>
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">未選択</option>
              {HIYARI_PLACES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {place === "other" && (
            <input
              type="text"
              value={placeOther}
              onChange={(e) => setPlaceOther(e.target.value)}
              placeholder="場所を入力"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[160px]"
            />
          )}
        </div>

        {/* 3. 状況の概要（唯一の必須項目） */}
        <div className="space-y-1">
          <span className="block text-xs font-medium text-gray-600">
            状況の概要（必須）
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="いつ・誰が・何をしようとして・どうなったか を簡潔に。例: 処置の直前に、別の患者様のカルテを参照していることに気づき、一時中断した。"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* 4. 要因（複数可・「その他」選択時のみ自由記述） */}
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-gray-600">
            そう思う要因（複数可・推測で構いません）
          </legend>
          <div className="flex flex-col gap-1.5">
            {HIYARI_FACTORS.map((f) => (
              <label
                key={f.value}
                className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={factors.includes(f.value)}
                  onChange={() => toggleFactor(f.value)}
                  className="rounded mt-0.5"
                />
                <span>
                  {f.label}
                  {f.hint && (
                    <span className="text-xs text-gray-500">（{f.hint}）</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {factors.includes("other") && (
            <input
              type="text"
              value={factorOther}
              onChange={(e) => setFactorOther(e.target.value)}
              placeholder="その他の要因を入力"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full"
            />
          )}
        </fieldset>

        {/* 5. 影響の程度（注記は指示書122の指定文言そのまま） */}
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-gray-600">
            影響の程度
          </legend>
          <div className="flex flex-col gap-1.5">
            {HIYARI_LEVELS.map((l) => (
              <label
                key={l.value}
                className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="radio"
                  name="hiyari-level"
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                  className="mt-0.5"
                />
                <span>
                  {l.badge} {l.label}＝{l.desc}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            ※実害があった場合（レベル2以上）は、このフォームではなく直接院長へお知らせください。
          </p>
        </fieldset>

        {/* 6. 当面の対策・改善案（任意） */}
        <div className="space-y-1">
          <span className="block text-xs font-medium text-gray-600">
            当面の対策・改善案（気づいた点があれば・任意）
          </span>
          <textarea
            value={countermeasure}
            onChange={(e) => setCountermeasure(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* 7. 職種（任意・匿名ON中は無効化＝匿名の安全弁。指示書122） */}
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block font-medium">職種（任意）</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={anonymous}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-50 disabled:bg-gray-50"
            >
              <option value="">未選択</option>
              {HIYARI_ROLES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {anonymous && (
            <span className="text-xs text-gray-500 pb-1.5">
              匿名のときは職種も保存されません
            </span>
          )}
        </div>

        {/* 8. 匿名チェック＋送信（既存のまま） */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="rounded"
              />
              匿名で報告する
            </label>
            <span className="text-xs text-gray-500">
              {myId
                ? anonymous
                  ? "「匿名」として報告します（誰が書いたかは記録されません）"
                  : `${myName || "名前未設定"} として報告します`
                : "報告にはログインが必要です"}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!myId || !draft.trim() || submitting}
            className="text-sm px-4 py-2 bg-amber-600 text-white rounded-full hover:bg-amber-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "送信中…" : "🚨 報告する"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* 一覧（新着順・削除済みは非表示） */}
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center animate-pulse">
          読み込んでいます…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          まだ報告がありません。小さな『ヒヤリ』こそ、チームの財産です。
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            // 記名投稿は最新プロフィール名で解決・匿名投稿は「匿名」のまま
            const authorName = p.authorId
              ? (resolveReactorName(
                  { id: p.authorId, name: p.authorName || null },
                  reactions.profileNames
                ) ?? "名前未設定")
              : "匿名";
            // 職種は記名投稿の個票内でのみ表示（匿名は normalize で破棄済み）
            const roleLabel = p.authorId
              ? hiyariOptionLabel(HIYARI_ROLES, p.role)
              : "";
            const isLong =
              p.body.length > 120 || p.body.split("\n").length > 3;
            const expanded = expandedIds.has(p.id);
            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">
                    {authorName}
                    {roleLabel && (
                      <span className="font-normal text-gray-500">
                        （{roleLabel}）
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(p.createdAt)}
                    {p.updatedAt !== p.createdAt && (
                      <span className="ml-1">（編集済み）</span>
                    )}
                  </span>
                </div>

                {editingId === p.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={4}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={savingEdit}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={savingEdit || !editDraft.trim()}
                        className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-full hover:bg-amber-700 disabled:opacity-50"
                      >
                        {savingEdit ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* 構造化バッジ（旧形式の投稿は何も出ない=従来どおり） */}
                    <HiyariBadges report={p} />
                    <p
                      className={`text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ${
                        isLong && !expanded ? "line-clamp-3" : ""
                      }`}
                    >
                      {p.body}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(p.id)}
                        className="text-xs text-teal-700 hover:underline"
                      >
                        {expanded ? "▲ たたむ" : "▼ 全文を読む"}
                      </button>
                    )}
                    {p.countermeasure && (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-teal-50/60 border border-teal-100 rounded-lg px-3 py-2">
                        💡 対策案: {p.countermeasure}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* 排他リアクション（報告への感謝に応える・1人1つ・変更可） */}
                  <ReactionBar newsId={p.id} controller={reactions} />
                  {canManage(p) && editingId !== p.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        aria-label="編集"
                        title="編集"
                        className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        disabled={busyId === p.id}
                        aria-label="削除"
                        title="削除"
                        className="text-xs px-2 py-1 text-gray-500 hover:text-red-600 disabled:opacity-50"
                      >
                        🗑️ 削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HiyariReportPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/hiyari-report"
        title="🚨 ヒヤリハット報告"
        description="気づいた人が組織を救う、安全の分かち合い"
      />
      <FeatureGate feature="hiyari">
        <HiyariReportPageBody />
      </FeatureGate>
    </div>
  );
}
