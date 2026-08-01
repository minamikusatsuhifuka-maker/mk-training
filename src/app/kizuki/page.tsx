"use client";

// 💡 日々の気づき投稿（指示書104・機能ID kizuki・B案=新設）
// - 評価やランキングの場ではなく「評価しない・ただ受け取る」分かち合いの場。
//   個人別の投稿件数・ランキング・並び替えは実装しない（指示書の禁止事項）。
// - データは content_store kizuki_posts（lib/kizuki.ts）。記名式・論理削除。
// - リアクションは既存排他モデルを別キー kizuki_reactions で流用（useNewsReactions(storeKey)）。
// - ページ全体を FeatureGate(kizuki) で包む（OFF時はナビ非表示＋直URLで準備中表示）。
// - 既存「気づきシェア」（ホームの portal_hiyari）とは別物・無干渉。

import { useState, useEffect, useCallback, useMemo } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  useNewsReactions,
  ReactionBar,
} from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  KIZUKI_REACTIONS_KEY,
  loadKizukiStore,
  saveKizukiStore,
  genKizukiId,
  visibleKizukiPosts,
  type KizukiPost,
} from "@/lib/kizuki";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";

// ログイン中の管理者判定（LibraryBrowser・GanttChart と同じ流儀）
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

function KizukiPageBody() {
  const [posts, setPosts] = useState<KizukiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 編集中の投稿（本人 or 管理者のみ）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  // リアクション（既存排他モデルを kizuki_reactions キーで流用）。
  // identity/loggedIn/profileNames（表示名解決）もこのコントローラから使う。
  const reactions = useNewsReactions(KIZUKI_REACTIONS_KEY);
  const myId = reactions.loggedIn ? (reactions.identity?.id ?? "") : "";

  const refresh = useCallback(async () => {
    try {
      const store = await loadKizukiStore();
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

  const visible = useMemo(() => visibleKizukiPosts(posts), [posts]);

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
      const store = await loadKizukiStore();
      const now = new Date().toISOString();
      const post: KizukiPost = {
        id: genKizukiId(),
        authorId: myId,
        authorName: myName,
        body,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const next = [...store.posts, post];
      const ok = await saveKizukiStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setDraft("");
    } catch {
      setError("投稿に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = (p: KizukiPost) => isAdmin || (!!myId && p.authorId === myId);

  const startEdit = (p: KizukiPost) => {
    setEditingId(p.id);
    setEditDraft(p.body);
  };

  const saveEdit = async () => {
    const body = editDraft.trim();
    if (!editingId || !body || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const store = await loadKizukiStore();
      const next = store.posts.map((p) =>
        p.id === editingId
          ? { ...p, body, updatedAt: new Date().toISOString() }
          : p
      );
      const ok = await saveKizukiStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setEditingId(null);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSavingEdit(false);
    }
  };

  // 確認ダイアログ付きの論理削除（deleted: true。管理画面から復元できる）
  const remove = async (p: KizukiPost) => {
    if (busyId) return;
    if (!confirm("この投稿を削除しますか？（管理画面から復元できます）")) return;
    setBusyId(p.id);
    setError("");
    try {
      const store = await loadKizukiStore();
      const next = store.posts.map((x) =>
        x.id === p.id
          ? { ...x, deleted: true, updatedAt: new Date().toISOString() }
          : x
      );
      const ok = await saveKizukiStore(next);
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
      {/* 指示書104の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
        日々の小さな『あれ?』『こうしたら良くなりそう』を、気軽に言葉にする場です。ここは評価の場ではありません。届いた気づきは、ただ受け取り、リアクションで応えましょう。
      </p>

      {/* 投稿フォーム（記名式・本文のみのシンプルな1欄） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="今日の小さな気づきを書いてみましょう…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-500">
            {myId
              ? `${myName || "名前未設定"} として投稿します（記名式）`
              : "投稿にはログインが必要です"}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!myId || !draft.trim() || submitting}
            className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "投稿中…" : "💡 投稿する"}
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
          まだ投稿がありません。最初の気づきを届けてみませんか?
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const authorName =
              resolveReactorName(
                { id: p.authorId, name: p.authorName || null },
                reactions.profileNames
              ) ?? "名前未設定";
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
                      rows={3}
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
                        className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50"
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
                  {/* 排他リアクション（1人1つ・変更可）。既存共有UIをそのまま利用 */}
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

export default function KizukiPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/kizuki"
        title="💡 日々の気づき"
        description="小さな「あれ?」を言葉にする場"
      />
      <FeatureGate feature="kizuki">
        <KizukiPageBody />
      </FeatureGate>
    </div>
  );
}
