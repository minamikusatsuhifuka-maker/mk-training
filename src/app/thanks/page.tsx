"use client";

// 💌 ありがとうカード（指示書105・機能ID thanks・A案=既存 portal_thankyou を核に拡張）
// - 全カードを全員が見られる新着順一覧（既存はホーム最新3件・/profile 自分宛のみだった閲覧範囲を拡大）。
// - 投稿は ThankyouFormModal（ホームの「＋送る」と同一コンポーネント＝送る場所は1箇所に一元化）。
// - リアクションは既存排他モデルを thanks_reactions キーで流用（useNewsReactions(storeKey)・指示書104整備）。
// - 個人別の受領数・送付数・ランキングは一切表示しない（指示書の厳守事項）。
// - 削除は論理削除（管理者のみ・ThankyouItem に authorId が無く本人判定できないため）。復元は管理画面から。
// - 既存表示（ホーム/profile）の表示制御は従来どおり portal_features.thanksShowcase。
//   本ページ・ナビ・リアクションの解禁のみ thanks フラグが制御する（二重スイッチの整理・確定済み）。

import { useState, useEffect, useCallback, useMemo } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { ThankyouFormModal } from "@/components/ThankyouFormModal";
import { useNewsReactions, ReactionBar } from "@/components/NewsReactions";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";
import {
  PORTAL_KEYS,
  formatThankyouTo,
  thankyouToNames,
  type ThankyouItem,
} from "@/types/portal";

// リアクション保存キー（指示書105で固定）
const THANKS_REACTIONS_KEY = "thanks_reactions";

// ログイン中の管理者判定（LibraryBrowser・/kizuki と同じ流儀）
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

function ThanksPageBody() {
  const [items, setItems] = useState<ThankyouItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  const reactions = useNewsReactions(THANKS_REACTIONS_KEY);

  const refresh = useCallback(async () => {
    try {
      const all = await loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []);
      setItems(all);
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

  // 削除済みを除き新着順（既存データは先頭挿入済みだが createdAt で並べ直して確実に）
  const visible = useMemo(
    () =>
      items
        .filter((t) => !t.deleted)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [items]
  );

  // 確認ダイアログ付きの論理削除（管理者のみ・復元は管理画面から）
  const remove = async (t: ThankyouItem) => {
    if (busyId) return;
    if (!confirm("このカードを削除しますか？（管理画面から復元できます）")) return;
    setBusyId(t.id);
    setError("");
    try {
      const all = await loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []);
      const next = all.map((x) =>
        x.id === t.id ? { ...x, deleted: true } : x
      );
      const ok = await savePortalItems(PORTAL_KEYS.thankyou, next);
      if (!ok) throw new Error("save failed");
      setItems(next);
    } catch {
      setError("削除に失敗しました。もう一度お試しください。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 指示書105の指定文言（そのまま使用） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-pink-50/60 border border-pink-100 rounded-xl px-4 py-3">
        日々の中で受け取った優しさや助けに、名前を添えて感謝を届ける場です。小さなことほど、言葉にして贈りましょう。
      </p>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm px-4 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 min-h-[40px]"
        >
          + 送る
        </button>
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
          まだカードがありません。最初のありがとうを贈ってみませんか?
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-xs font-medium text-pink-700 flex-shrink-0">
                  {(thankyouToNames(t)[0] ?? "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {t.fromName} → {formatThankyouTo(t)}
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mt-1">
                    {t.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {formatDateTime(t.createdAt)}
                  </p>
                </div>
                <span className="text-pink-400 flex-shrink-0 text-base">♥</span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* 排他リアクション（1人1つ・変更可）。104で整備した共有UIを thanks_reactions キーで再利用 */}
                <ReactionBar newsId={t.id} controller={reactions} />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={busyId === t.id}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-red-600 disabled:opacity-50 shrink-0"
                  >
                    🗑️ 削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ホームの「＋送る」と同一フォーム（投稿導線の一元化） */}
      <ThankyouFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmitted={(next) => setItems(next)}
      />
    </div>
  );
}

export default function ThanksPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/thanks"
        title="💌 ありがとうカード"
        description="感謝を見える形で贈り合う"
      />
      <FeatureGate feature="thanks">
        <ThanksPageBody />
      </FeatureGate>
    </div>
  );
}
