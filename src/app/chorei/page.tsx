"use client";

// 🌅 朝礼サポート（指示書108・機能ID chorei）
// - 朝礼の3分共有（good and new・学び・連絡）を記録し、輪番を仕組みで支える。
// - 輪番は投稿駆動: 「この投稿で当番を次へ進める」（既定ON）で投稿するとポインタが前進。
//   当番本人以外の代理投稿でも進められる。補足メモ等はチェックOFFで投稿（ポインタ不動）。
// - 投稿の論理削除でポインタは巻き戻さない（ズレは管理画面の手動調整で直す）。
// - 個人別の投稿件数・ランキングは実装しない。雛形は /kizuki（指示書104）。

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { resolveReactorName } from "@/lib/news-reactions";
import {
  CHOREI_REACTIONS_KEY,
  loadChoreiData,
  saveChoreiData,
  genChoreiId,
  visibleChoreiPosts,
  currentDuty,
  nextDuty,
  advancePointer,
  EMPTY_ROTATION,
  type ChoreiPost,
  type ChoreiRotation,
} from "@/lib/chorei";
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

function ChoreiPageBody() {
  const [rotation, setRotation] = useState<ChoreiRotation>(EMPTY_ROTATION);
  const [posts, setPosts] = useState<ChoreiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [advanceOnPost, setAdvanceOnPost] = useState(true); // 既定ON
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  const reactions = useNewsReactions(CHOREI_REACTIONS_KEY);
  const myId = reactions.loggedIn ? (reactions.identity?.id ?? "") : "";

  const refresh = useCallback(async () => {
    try {
      const data = await loadChoreiData();
      setRotation(data.rotation);
      setPosts(data.posts);
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

  const visible = useMemo(() => visibleChoreiPosts(posts), [posts]);
  const duty = currentDuty(rotation);
  const next = nextDuty(rotation);

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
      // 投稿追加＋（チェックONなら）ポインタ前進を1回の書き込みで行う
      const data = await loadChoreiData();
      const now = new Date().toISOString();
      const dutyNow = currentDuty(data.rotation);
      const post: ChoreiPost = {
        id: genChoreiId(),
        authorId: myId,
        authorName: myName,
        body,
        onDutyName: dutyNow?.name ?? "",
        advanced: advanceOnPost && data.rotation.order.length > 0,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      const nextRotation = post.advanced
        ? advancePointer(data.rotation)
        : data.rotation;
      const nextPosts = [...data.posts, post];
      const ok = await saveChoreiData({
        rotation: nextRotation,
        posts: nextPosts,
      });
      if (!ok) throw new Error("save failed");
      setRotation(nextRotation);
      setPosts(nextPosts);
      setDraft("");
      setAdvanceOnPost(true);
    } catch {
      setError("投稿に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = (p: ChoreiPost) =>
    isAdmin || (!!myId && p.authorId === myId);

  const startEdit = (p: ChoreiPost) => {
    setEditingId(p.id);
    setEditDraft(p.body);
  };

  const saveEdit = async () => {
    const body = editDraft.trim();
    if (!editingId || !body || savingEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      const data = await loadChoreiData();
      const nextPosts = data.posts.map((p) =>
        p.id === editingId
          ? { ...p, body, updatedAt: new Date().toISOString() }
          : p
      );
      const ok = await saveChoreiData({
        rotation: data.rotation,
        posts: nextPosts,
      });
      if (!ok) throw new Error("save failed");
      setRotation(data.rotation);
      setPosts(nextPosts);
      setEditingId(null);
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSavingEdit(false);
    }
  };

  // 論理削除（ポインタは巻き戻さない＝rotation はそのまま保存）
  const remove = async (p: ChoreiPost) => {
    if (busyId) return;
    if (!confirm("この記録を削除しますか？（管理画面から復元できます）")) return;
    setBusyId(p.id);
    setError("");
    try {
      const data = await loadChoreiData();
      const nextPosts = data.posts.map((x) =>
        x.id === p.id
          ? { ...x, deleted: true, updatedAt: new Date().toISOString() }
          : x
      );
      const ok = await saveChoreiData({
        rotation: data.rotation,
        posts: nextPosts,
      });
      if (!ok) throw new Error("save failed");
      setRotation(data.rotation);
      setPosts(nextPosts);
    } catch {
      setError("削除に失敗しました。もう一度お試しください。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 当番表示 */}
      <div className="bg-white border border-orange-200 rounded-xl px-4 py-3">
        {duty ? (
          <p className="text-sm text-gray-800">
            🎤 今日の当番:{" "}
            <span className="font-semibold">{duty.name}さん</span>
            {next && (
              <span className="text-gray-500 ml-2">／ 次: {next.name}さん</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            当番はまだ設定されていません（管理画面で設定できます）
          </p>
        )}
      </div>

      {/* 指示書108の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-orange-50/60 border border-orange-100 rounded-xl px-4 py-3">
        朝礼の3分共有は、学びをチームの財産に変える時間です。good and new・気づき・連絡事項など、自由に残しましょう。話した人も聞いた人も、リアクションで受け取りを伝え合えます。
      </p>

      {/* 投稿フォーム（自由記述1欄＋当番前進チェック・既定ON） */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="今日の学び・good and new・連絡事項など、自由にどうぞ"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={advanceOnPost}
                onChange={(e) => setAdvanceOnPost(e.target.checked)}
                className="rounded"
              />
              この投稿で当番を次へ進める
            </label>
            <span className="text-xs text-gray-500">
              {myId
                ? `${myName || "名前未設定"} として投稿します`
                : "投稿にはログインが必要です"}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!myId || !draft.trim() || submitting}
            className="text-sm px-4 py-2 bg-orange-600 text-white rounded-full hover:bg-orange-700 disabled:opacity-50 min-h-[40px]"
          >
            {submitting ? "投稿中…" : "🌅 記録する"}
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
          まだ記録がありません。今日の朝礼から、はじめてみましょう。
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {authorName}
                    </span>
                    {p.onDutyName && (
                      <span className="text-[10px] font-medium bg-orange-100 text-orange-800 rounded-full px-2 py-0.5">
                        🎤 当番: {p.onDutyName}
                      </span>
                    )}
                  </div>
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
                        className="text-xs px-3 py-1.5 bg-orange-600 text-white rounded-full hover:bg-orange-700 disabled:opacity-50"
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

export default function ChoreiPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="🌅 朝礼サポート"
        description="輪番と学び共有の記録"
      />
      <FeatureGate feature="chorei">
        <ChoreiPageBody />
      </FeatureGate>
    </div>
  );
}
