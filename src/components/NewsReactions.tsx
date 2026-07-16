"use client";

// お知らせリアクションの共通UI（指示書37R・匿名OK）
// - useNewsReactions: ページ単位で1回だけ全リアクションを読み込み、トグル/名前設定を提供
// - ReactionBar: 詳細モーダル用のリアクションバー（トグル・押した人一覧・名前設定）
// - ReactionSummary: 一覧カード用の件数サマリー（👍3 ✅5 のような表示）

import { useEffect, useState } from "react";
import {
  REACTION_META,
  loadNewsReactions,
  saveNewsReactions,
  getReactorIdentity,
  setReaction,
  hasReacted,
  applyReactorName,
  reactorNamesLabel,
  resolveReactorName,
  NEWS_AUTHOR_LS_KEY,
  type NewsReactionsMap,
  type ReactionKey,
  type Reactor,
  type ReactorNameMap,
} from "@/lib/news-reactions";
import { loadProfilesIndex } from "@/lib/staff-profiles";

export type NewsReactionsController = {
  map: NewsReactionsMap;
  identity: Reactor | null;
  loggedIn: boolean;
  // userId → プロフィール登録名（「押した人を見る」の表示名解決用・画面あたり1回だけ読む）
  profileNames: ReactorNameMap;
  toggle: (newsId: string, key: ReactionKey) => Promise<void>;
  setName: (name: string) => Promise<void>;
};

export function useNewsReactions(): NewsReactionsController {
  const [map, setMap] = useState<NewsReactionsMap>({});
  const [identity, setIdentity] = useState<Reactor | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileNames, setProfileNames] = useState<ReactorNameMap>({});

  useEffect(() => {
    loadNewsReactions()
      .then(setMap)
      .catch(() => {});
    getReactorIdentity()
      .then((r) => {
        setIdentity(r.reactor);
        setLoggedIn(r.loggedIn);
      })
      .catch(() => {});
    // プロフィール一覧は画面あたり1回だけ（リアクション1件ごとには読まない）。
    // 読めなくても保存済み name にフォールバックするので表示は壊れない。
    loadProfilesIndex()
      .then((items) => {
        const names: ReactorNameMap = {};
        for (const p of items) {
          const name = (p.name ?? "").trim();
          if (p.userId && name) names[p.userId] = name;
        }
        setProfileNames(names);
      })
      .catch(() => {});
  }, []);

  // タップでトグル（楽観更新→保存。失敗時は元に戻す）。
  // 保存は最新データを読み直してから「望む最終状態」を適用する（並行更新に強く）。
  const toggle = async (newsId: string, key: ReactionKey) => {
    if (!identity) return;
    const prev = map;
    const active = !hasReacted(prev, newsId, key, identity.id);
    const optimistic = setReaction(prev, newsId, key, identity, active);
    setMap(optimistic);
    try {
      const fresh = await loadNewsReactions().catch(() => prev);
      const merged = setReaction(fresh, newsId, key, identity, active);
      const ok = await saveNewsReactions(merged);
      setMap(ok ? merged : prev);
    } catch {
      setMap(prev);
    }
  };

  // 名前の設定/変更（空文字=匿名に戻す）。同一IDの過去リアクションも遡って更新。
  const setName = async (nameInput: string) => {
    if (!identity) return;
    const name = nameInput.trim() || null;
    if (!loggedIn) {
      try {
        if (name) {
          localStorage.setItem(NEWS_AUTHOR_LS_KEY, name);
        } else {
          localStorage.removeItem(NEWS_AUTHOR_LS_KEY);
        }
      } catch {
        // 記憶できない環境でも今セッションの表示には反映する
      }
    }
    setIdentity({ ...identity, name });
    const prev = map;
    setMap(applyReactorName(prev, identity.id, name));
    try {
      const fresh = await loadNewsReactions().catch(() => prev);
      const merged = applyReactorName(fresh, identity.id, name);
      const ok = await saveNewsReactions(merged);
      if (ok) setMap(merged);
    } catch {
      // 保存失敗時もローカル表示は維持（次回トグル時に再同期される）
    }
  };

  return { map, identity, loggedIn, profileNames, toggle, setName };
}

// ─── 一覧カード用サマリー（件数のあるリアクションだけ小さく表示） ───
export function ReactionSummary({
  map,
  newsId,
}: {
  map: NewsReactionsMap;
  newsId: string;
}) {
  const entry = map[newsId];
  if (!entry) return null;
  const parts = REACTION_META.filter((m) => (entry[m.key]?.length ?? 0) > 0);
  if (parts.length === 0) return null;
  return (
    <span className="text-xs text-gray-500">
      {parts.map((m) => `${m.emoji}${entry[m.key]!.length}`).join(" ")}
    </span>
  );
}

// ─── 詳細モーダル用リアクションバー ───
export function ReactionBar({
  newsId,
  controller,
}: {
  newsId: string;
  controller: NewsReactionsController;
}) {
  const { map, identity, loggedIn, profileNames, toggle, setName } = controller;
  const [showPeople, setShowPeople] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const entry = map[newsId] ?? {};
  const hasAny = REACTION_META.some((m) => (entry[m.key]?.length ?? 0) > 0);

  const openNameModal = () => {
    setNameInput(identity?.name ?? "");
    setShowNameModal(true);
  };

  const handleSaveName = async () => {
    await setName(nameInput);
    setShowNameModal(false);
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-200/70">
      <div className="flex flex-wrap items-center gap-1.5">
        {REACTION_META.map((m) => {
          const list = entry[m.key] ?? [];
          const mine = !!identity && list.some((r) => r.id === identity.id);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(newsId, m.key)}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                mine
                  ? "bg-teal-100 border-teal-300 text-teal-800 font-medium"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
              {list.length > 0 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPeople((v) => !v);
                  }}
                  className={`ml-0.5 px-1.5 rounded-full text-[11px] tabular-nums ${
                    mine ? "bg-white/70" : "bg-gray-100"
                  }`}
                  title="押した人を見る"
                >
                  {list.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => setShowPeople((v) => !v)}
          disabled={!hasAny}
          className="text-[11px] text-gray-400 underline underline-offset-2 disabled:no-underline disabled:opacity-0"
        >
          {showPeople ? "閉じる" : "押した人を見る"}
        </button>
        {loggedIn ? (
          <span className="text-[11px] text-gray-400">
            {(identity && resolveReactorName(identity, profileNames)) ?? ""}{" "}
            として反応中
          </span>
        ) : (
          <button
            type="button"
            onClick={openNameModal}
            className="text-[11px] text-gray-400 underline underline-offset-2"
          >
            {identity?.name ? `${identity.name} として反応中・変更` : "名前を設定"}
          </button>
        )}
      </div>

      {/* 押した人一覧（名前／匿名 ×N） */}
      {showPeople && hasAny && (
        <div className="mt-1.5 space-y-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          {REACTION_META.filter((m) => (entry[m.key]?.length ?? 0) > 0).map(
            (m) => (
              <p key={m.key} className="text-[11px] text-gray-600">
                {m.emoji} {m.label}：
                {reactorNamesLabel(entry[m.key] ?? [], profileNames)}
              </p>
            )
          )}
        </div>
      )}

      {/* 名前設定ミニモーダル */}
      {showNameModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowNameModal(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white shadow-xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-medium text-gray-900">名前を設定</h4>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="例：山田 花子"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-[11px] text-gray-500">
              過去に匿名で押したリアクションも名前表示になります。空のまま保存すると匿名に戻ります。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNameModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveName}
                className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
