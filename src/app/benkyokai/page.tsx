"use client";

// 📖 勉強会アーカイブ（指示書109・機能ID benkyokai）
// - 月1勉強会を「開催して終わり」にせず、テーマ・資料・学びを開催回ごとに記録する。
// - 資料の実体は資料庫（リンク型含む）にあり、ここからは libraryRefs: {docId}[] の参照のみ。
//   チップから /library?doc=<id>（107新設のディープリンク）でプレビューへ遷移。
//   削除済み資料は⚠表記で残す（リンク先は資料が見つからず通常一覧にフォールバック）。
// - 紐付け操作は投稿者本人も可（管理者は全投稿）。選択パネルは LibraryDocPicker を共用。
// - 一覧は開催日（heldOn）降順・同日は作成日時降順。開催日入力は max=今日（JST）で未来入力を予防。
// - 個人別の投稿件数・ランキングは実装しない。雛形は /kizuki 系（指示書104〜108）。

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { LibraryDocPicker } from "@/components/LibraryDocPicker";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  BENKYOKAI_REACTIONS_KEY,
  loadBenkyokaiStore,
  saveBenkyokaiStore,
  genBenkyokaiId,
  visibleBenkyokaiPosts,
  normalizeHeldOn,
  normalizeLibraryRefs,
  formatHeldOn,
  type BenkyokaiPost,
} from "@/lib/benkyokai";
import { loadPortalObject } from "@/lib/portal-store";
import { LIBRARY_KEY, normalizeStore, jstTodayYmd } from "@/lib/library";
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

// 選択済み資料のチップ列（新規/編集フォームと一覧表示で共用）
function LibraryRefChips({
  refs,
  titles,
  onRemove,
  link = false,
}: {
  refs: { docId: string }[];
  titles: Map<string, string>;
  onRemove?: (docId: string) => void;
  /** 閲覧文脈（一覧表示）のみ true = 119の新タブリンク。
      フォーム内（新規/編集）は既定の非リンク＝クリックしても何も起きない。
      誤タップによるページ遷移・入力消失を防ぐ（指示書120） */
  link?: boolean;
}) {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r) => {
        const title = titles.get(r.docId);
        // 119: 閲覧文脈は新しいタブで開く（プレビューを閉じたらタブを閉じるだけで戻れる）
        const chip = title ? (
          link ? (
            <Link
              href={`/library?doc=${encodeURIComponent(r.docId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100"
            >
              📄 {title} ↗
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
              📄 {title}
            </span>
          )
        ) : link ? (
          // 削除済み等で解決できない資料は⚠表記で残す（リンク先は一覧にフォールバック）
          <Link
            href={`/library?doc=${encodeURIComponent(r.docId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100"
          >
            ⚠ 資料が見つかりません ↗
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            ⚠ 資料が見つかりません
          </span>
        );
        return (
          <span key={r.docId} className="inline-flex items-center gap-1">
            {chip}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(r.docId)}
                aria-label="この資料の紐付けを外す"
                className="text-xs text-gray-400 hover:text-red-600 leading-none"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
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

function BenkyokaiPageBody() {
  const [posts, setPosts] = useState<BenkyokaiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 新規フォーム
  const [titleDraft, setTitleDraft] = useState("");
  const [heldOnDraft, setHeldOnDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [draftRefs, setDraftRefs] = useState<{ docId: string }[]>([]);
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 編集（本文系＋紐付け変更）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editHeldOn, setEditHeldOn] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editRefs, setEditRefs] = useState<{ docId: string }[]>([]);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 展開中の学びメモ（既定は折りたたみ）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 資料タイトル解決（チップ表示用・anon 直読み）
  const [libraryTitles, setLibraryTitles] = useState<Map<string, string>>(
    new Map()
  );

  const isAdmin = useIsAdmin();
  const reactions = useNewsReactions(BENKYOKAI_REACTIONS_KEY);
  const myId = reactions.loggedIn ? (reactions.identity?.id ?? "") : "";
  const today = jstTodayYmd();

  const refresh = useCallback(async () => {
    try {
      const store = await loadBenkyokaiStore();
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

  const visible = useMemo(() => visibleBenkyokaiPosts(posts), [posts]);

  const myName = useMemo(() => {
    if (!reactions.identity) return "";
    return (
      resolveReactorName(reactions.identity, reactions.profileNames) ?? ""
    );
  }, [reactions.identity, reactions.profileNames]);

  const submit = async () => {
    const title = titleDraft.trim();
    const heldOn = normalizeHeldOn(heldOnDraft);
    if (!title) {
      setError("テーマを入力してください");
      return;
    }
    if (!heldOn) {
      setError("開催日を入力してください");
      return;
    }
    if (!myId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const store = await loadBenkyokaiStore();
      const now = new Date().toISOString();
      const post: BenkyokaiPost = {
        id: genBenkyokaiId(),
        authorId: myId,
        authorName: myName,
        title,
        heldOn,
        body: bodyDraft.trim(),
        libraryRefs: normalizeLibraryRefs(draftRefs),
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const next = [...store.posts, post];
      const ok = await saveBenkyokaiStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setTitleDraft("");
      setHeldOnDraft("");
      setBodyDraft("");
      setDraftRefs([]);
      setDraftPickerOpen(false);
    } catch {
      setError("投稿に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = (p: BenkyokaiPost) =>
    isAdmin || (!!myId && p.authorId === myId);

  const startEdit = (p: BenkyokaiPost) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditHeldOn(p.heldOn);
    setEditBody(p.body);
    setEditRefs(p.libraryRefs);
    setEditPickerOpen(false);
  };

  const saveEdit = async () => {
    const title = editTitle.trim();
    const heldOn = normalizeHeldOn(editHeldOn);
    if (!editingId || !title || !heldOn || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const store = await loadBenkyokaiStore();
      const next = store.posts.map((p) =>
        p.id === editingId
          ? {
              ...p,
              title,
              heldOn,
              body: editBody.trim(),
              libraryRefs: normalizeLibraryRefs(editRefs),
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      const ok = await saveBenkyokaiStore(next);
      if (!ok) throw new Error("save failed");
      setPosts(next);
      setEditingId(null);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (p: BenkyokaiPost) => {
    if (busyId) return;
    if (!confirm("この記録を削除しますか？（管理画面から復元できます）")) return;
    setBusyId(p.id);
    setError("");
    try {
      const store = await loadBenkyokaiStore();
      const next = store.posts.map((x) =>
        x.id === p.id
          ? { ...x, deleted: true, updatedAt: new Date().toISOString() }
          : x
      );
      const ok = await saveBenkyokaiStore(next);
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
      {/* 指示書109の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-sky-50/60 border border-sky-100 rounded-xl px-4 py-3">
        月1回の勉強会は、学びをチームの財産へ変える場です。開催したら、テーマ・使った資料・学んだことをここに記録しましょう。あとから見返す仲間や、これから加わる新しい仲間への贈り物になります。※開催前の告知はお知らせ・朝礼で行い、ここには開催後の記録を残します。
      </p>

      {/* 投稿フォーム */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="テーマ（例: メソナJの安全な運用と接遇ポイント）"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-600" htmlFor="bnk-held-on">
            開催日
          </label>
          <input
            id="bnk-held-on"
            type="date"
            value={heldOnDraft}
            max={today}
            onChange={(e) => setHeldOnDraft(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
          />
        </div>
        <textarea
          value={bodyDraft}
          onChange={(e) => setBodyDraft(e.target.value)}
          rows={6}
          placeholder="学んだこと・気づき・現場でどう活かすか、自由にどうぞ"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
        />
        {/* 資料の紐付け（複数・チップで個別解除可） */}
        <div className="space-y-2">
          <LibraryRefChips
            refs={draftRefs}
            titles={libraryTitles}
            onRemove={(docId) =>
              setDraftRefs((prev) => prev.filter((r) => r.docId !== docId))
            }
          />
          <button
            type="button"
            onClick={() => setDraftPickerOpen((v) => !v)}
            className="text-xs px-3 py-1.5 border border-emerald-200 text-emerald-700 rounded-full hover:bg-emerald-50"
          >
            {draftPickerOpen ? "選択をやめる" : "📎 資料庫から資料を紐付ける"}
          </button>
          {draftPickerOpen && (
            <LibraryDocPicker
              onPick={(d) =>
                setDraftRefs((prev) =>
                  prev.some((r) => r.docId === d.id)
                    ? prev
                    : [...prev, { docId: d.id }]
                )
              }
              excludeIds={draftRefs.map((r) => r.docId)}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-500">
            {myId
              ? `${myName || "名前未設定"} として記録します`
              : "記録にはログインが必要です"}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!myId || !titleDraft.trim() || !heldOnDraft || submitting}
            className="text-sm px-4 py-2 bg-sky-600 text-white rounded-full hover:bg-sky-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "記録中…" : "📖 記録する"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* 一覧（開催日降順・削除済みは非表示） */}
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center animate-pulse">
          読み込んでいます…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          まだ記録がありません。次の勉強会から、アーカイブを始めましょう。
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const authorName =
              resolveReactorName(
                { id: p.authorId, name: p.authorName || null },
                reactions.profileNames
              ) ?? "名前未設定";
            const isExpanded = expanded.has(p.id);
            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[10px] font-medium bg-sky-100 text-sky-800 rounded-full px-2 py-0.5 shrink-0">
                      📅 {formatHeldOn(p.heldOn)}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 break-words">
                      {p.title}
                    </h3>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {authorName}・{formatDateTime(p.createdAt)}
                    {p.updatedAt !== p.createdAt && (
                      <span className="ml-1">（編集済み）</span>
                    )}
                  </span>
                </div>

                {editingId === p.id ? (
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={editHeldOn}
                      max={today}
                      onChange={(e) => setEditHeldOn(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={6}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
                    />
                    <LibraryRefChips
                      refs={editRefs}
                      titles={libraryTitles}
                      onRemove={(docId) =>
                        setEditRefs((prev) =>
                          prev.filter((r) => r.docId !== docId)
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setEditPickerOpen((v) => !v)}
                      className="text-xs px-3 py-1.5 border border-emerald-200 text-emerald-700 rounded-full hover:bg-emerald-50"
                    >
                      {editPickerOpen ? "選択をやめる" : "📎 資料を紐付ける"}
                    </button>
                    {editPickerOpen && (
                      <LibraryDocPicker
                        onPick={(d) =>
                          setEditRefs((prev) =>
                            prev.some((r) => r.docId === d.id)
                              ? prev
                              : [...prev, { docId: d.id }]
                          )
                        }
                        excludeIds={editRefs.map((r) => r.docId)}
                      />
                    )}
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
                        disabled={savingEdit || !editTitle.trim() || !editHeldOn}
                        className="text-xs px-3 py-1.5 bg-sky-600 text-white rounded-full hover:bg-sky-700 disabled:opacity-50"
                      >
                        {savingEdit ? "保存中…" : "保存"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <LibraryRefChips refs={p.libraryRefs} titles={libraryTitles} link />
                    {p.body && (
                      <div className="space-y-1">
                        <p
                          className={`text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ${
                            isExpanded ? "" : "line-clamp-3"
                          }`}
                        >
                          {p.body}
                        </p>
                        {(p.body.split("\n").length > 3 ||
                          p.body.length > 150) && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(p.id)}
                            className="text-xs text-sky-700 underline hover:opacity-70"
                          >
                            {isExpanded ? "たたむ" : "続きを読む"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <ReactionBar newsId={p.id} controller={reactions} />
                  {canManage(p) && editingId !== p.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        aria-label="編集"
                        title="編集（紐付けの変更もこちら）"
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

export default function BenkyokaiPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="📖 勉強会アーカイブ"
        description="月1勉強会の資料と学びの蓄積"
      />
      <FeatureGate feature="benkyokai">
        <BenkyokaiPageBody />
      </FeatureGate>
    </div>
  );
}
