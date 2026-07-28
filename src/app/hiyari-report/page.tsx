"use client";

// 🚨 ヒヤリハット報告（指示書106・機能ID hiyari）
// - 責任追及ではなく仲間と組織を守るための分かち合いの場。報告そのものが称えられる設計。
//   個人別の報告件数・ランキング・並び替えは実装しない（指示書の禁止事項）。
// - 記名基本＋匿名選択可（院長決定）。匿名時は authorId を一切保存しない（真の匿名）。
// - データは content_store hiyari_reports（lib/hiyari-reports.ts）。論理削除。
// - リアクションは既存排他モデルを hiyari_reactions キーで流用。
// - 雛形は /kizuki（指示書104）。既存「気づきシェア」（portal_hiyari）とは別物。

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  HIYARI_REACTIONS_KEY,
  loadHiyariStore,
  saveHiyariStore,
  genHiyariReportId,
  visibleHiyariReports,
  type HiyariReport,
} from "@/lib/hiyari-reports";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";

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

  const submit = async () => {
    const body = draft.trim();
    if (!body || !myId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const store = await loadHiyariStore();
      const now = new Date().toISOString();
      // 真の匿名: 匿名選択時は authorId フィールド自体を含めない（指示書106・厳守）
      const post: HiyariReport = {
        id: genHiyariReportId(),
        ...(anonymous ? {} : { authorId: myId }),
        authorName: anonymous ? "匿名" : myName,
        body,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const next = [...store.posts, post];
      const ok = await saveHiyariStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setDraft("");
      setAnonymous(false);
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

      {/* 投稿フォーム（記名基本＋匿名選択可） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="何が起きたか（事実）→ なぜ起きたと思うか → どうすれば防げそうか、の順で書くと伝わりやすいです"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
        />
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
            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">
                    {authorName}
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
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {p.body}
                  </p>
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
      <PageHeader
        title="🚨 ヒヤリハット報告"
        description="気づいた人が組織を救う、安全の分かち合い"
      />
      <FeatureGate feature="hiyari">
        <HiyariReportPageBody />
      </FeatureGate>
    </div>
  );
}
