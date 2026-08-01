"use client";

// ✍️ マニュアル下書き（指示書107・機能ID manual_draft）
// - 「マニュアルは未来の仲間への贈り物」。完成度を問わず手順やコツを下書きとして残す場。
//   下書き → 院長確認 → 正式マニュアル化 → 資料庫登録（管理タブで紐付け）の流れを見える化。
// - 全スタッフ閲覧可＋リアクション（院長決定）。記名のみ・論理削除。
// - 📗 登録済みの下書きは資料庫の該当資料へ /library?doc=<docId> でリンク（107新設のディープリンク）。
// - 個人別の投稿件数・ランキング・並び替えは実装しない。ステータス絞り込みチップのみ可。
// - 雛形は /kizuki（指示書104）。長文対応として本文は折りたたみ表示（冒頭数行＋続きを読む）。

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  MANUAL_DRAFT_REACTIONS_KEY,
  MANUAL_DRAFT_STATUS_META,
  loadManualDraftStore,
  saveManualDraftStore,
  genManualDraftId,
  visibleManualDrafts,
  type ManualDraft,
  type ManualDraftStatus,
} from "@/lib/manual-drafts";
import { loadPortalObject } from "@/lib/portal-store";
import { LIBRARY_KEY, normalizeStore } from "@/lib/library";
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

type StatusFilter = "all" | ManualDraftStatus;

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "draft", label: "✏️ 執筆中" },
  { key: "registered", label: "📗 登録済み" },
];

function ManualDraftsPageBody() {
  const [posts, setPosts] = useState<ManualDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // 長文対応: 展開中の下書きID（既定は折りたたみ）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 資料タイトル解決（📗リンクの表示用・LibraryNewsSection と同じ anon 直読み）
  const [libraryTitles, setLibraryTitles] = useState<Map<string, string>>(
    new Map()
  );

  const isAdmin = useIsAdmin();
  const reactions = useNewsReactions(MANUAL_DRAFT_REACTIONS_KEY);
  const myId = reactions.loggedIn ? (reactions.identity?.id ?? "") : "";

  const refresh = useCallback(async () => {
    try {
      const store = await loadManualDraftStore();
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
    loadPortalObject<unknown>(LIBRARY_KEY, null)
      .then((raw) => {
        const docs = normalizeStore(raw).docs;
        setLibraryTitles(new Map(docs.map((d) => [d.id, d.title])));
      })
      .catch(() => {});
  }, [refresh]);

  const visible = useMemo(() => {
    const base = visibleManualDrafts(posts);
    return statusFilter === "all"
      ? base
      : base.filter((p) => p.status === statusFilter);
  }, [posts, statusFilter]);

  const myName = useMemo(() => {
    if (!reactions.identity) return "";
    return (
      resolveReactorName(reactions.identity, reactions.profileNames) ?? ""
    );
  }, [reactions.identity, reactions.profileNames]);

  const submit = async () => {
    const title = titleDraft.trim();
    const body = bodyDraft.trim();
    if (!title) {
      setError("タイトルを入力してください");
      return;
    }
    if (!body || !myId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const store = await loadManualDraftStore();
      const now = new Date().toISOString();
      const post: ManualDraft = {
        id: genManualDraftId(),
        authorId: myId,
        authorName: myName,
        title,
        body,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const next = [...store.posts, post];
      const ok = await saveManualDraftStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setTitleDraft("");
      setBodyDraft("");
    } catch {
      setError("投稿に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = (p: ManualDraft) =>
    isAdmin || (!!myId && p.authorId === myId);

  const startEdit = (p: ManualDraft) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditBody(p.body);
  };

  const saveEdit = async () => {
    const title = editTitle.trim();
    const body = editBody.trim();
    if (!editingId || !title || !body || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const store = await loadManualDraftStore();
      const next = store.posts.map((p) =>
        p.id === editingId
          ? { ...p, title, body, updatedAt: new Date().toISOString() }
          : p
      );
      const ok = await saveManualDraftStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setEditingId(null);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (p: ManualDraft) => {
    if (busyId) return;
    if (!confirm("この下書きを削除しますか？（管理画面から復元できます）")) return;
    setBusyId(p.id);
    setError("");
    try {
      const store = await loadManualDraftStore();
      const next = store.posts.map((x) =>
        x.id === p.id
          ? { ...x, deleted: true, updatedAt: new Date().toISOString() }
          : x
      );
      const ok = await saveManualDraftStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
    } catch {
      setError("削除に失敗しました。もう一度お試しください。");
    } finally {
      setBusyId(null);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* 指示書107の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-3">
        マニュアルは、未来の仲間への贈り物です。完成度は問いません。日々の仕事の中で『これは書き残しておきたい』と思った手順やコツを、下書きとして気軽に残しましょう。良い下書きは、正式なマニュアルとして資料庫に登録されます。
      </p>

      {/* 投稿フォーム（タイトル必須＋本文） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="タイトル（例: レーザー機器の朝の立ち上げ手順）"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
        />
        <textarea
          value={bodyDraft}
          onChange={(e) => setBodyDraft(e.target.value)}
          rows={10}
          placeholder="手順やコツを書き残しましょう。箇条書きでも、メモ書きでも大丈夫です。"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
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
            disabled={!myId || !titleDraft.trim() || !bodyDraft.trim() || submitting}
            className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "投稿中…" : "✍️ 下書きを残す"}
          </button>
        </div>
      </div>

      {/* ステータス絞り込み（件数表示・ランキングは出さない） */}
      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStatusFilter(c.key)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              statusFilter === c.key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-emerald-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center animate-pulse">
          読み込んでいます…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          {statusFilter === "all"
            ? "まだ下書きがありません。あなたの『いつもの手順』が、誰かの道しるべになります。"
            : "この条件の下書きはありません。"}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const authorName =
              resolveReactorName(
                { id: p.authorId, name: p.authorName || null },
                reactions.profileNames
              ) ?? "名前未設定";
            const meta = MANUAL_DRAFT_STATUS_META[p.status];
            const isExpanded = expanded.has(p.id);
            const refTitle = p.libraryRef
              ? libraryTitles.get(p.libraryRef.docId)
              : undefined;
            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 break-words">
                      {p.title}
                    </h3>
                    <span
                      className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {authorName}・{formatDateTime(p.createdAt)}
                    {p.updatedAt !== p.createdAt && (
                      <span className="ml-1">（編集済み）</span>
                    )}
                  </span>
                </div>

                {/* 📗 登録済み: 資料庫の該当資料へのディープリンク（119: 新しいタブで開く） */}
                {p.libraryRef && (
                  <Link
                    href={`/library?doc=${encodeURIComponent(p.libraryRef.docId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100"
                  >
                    📗 資料庫で見る{refTitle ? `: ${refTitle}` : ""} ↗
                  </Link>
                )}

                {editingId === p.id ? (
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={10}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
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
                        disabled={savingEdit || !editTitle.trim() || !editBody.trim()}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {savingEdit ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p
                      className={`text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ${
                        isExpanded ? "" : "line-clamp-3"
                      }`}
                    >
                      {p.body}
                    </p>
                    {/* 長文（3行相当を超える見込み）のみ折りたたみトグルを表示 */}
                    {(p.body.split("\n").length > 3 || p.body.length > 150) && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(p.id)}
                        className="text-xs text-emerald-700 underline hover:opacity-70"
                      >
                        {isExpanded ? "たたむ" : "続きを読む"}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
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

export default function ManualDraftsPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/manual-drafts"
        title="✍️ マニュアル下書き"
        description="未来の仲間への贈り物を書く場"
      />
      <FeatureGate feature="manual_draft">
        <ManualDraftsPageBody />
      </FeatureGate>
    </div>
  );
}
