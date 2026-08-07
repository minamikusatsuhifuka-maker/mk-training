"use client";

// ありがとうカードの投稿フォーム（指示書105でホーム page.tsx から切り出し・挙動は従来と同一）
// - 宛先: 候補チップの複数選択（プロフィール名∪スタッフ名簿・正規化名で重複除去・指示書49）
//   ＋候補に無い名前の自由入力フォールバック（Enter/追加でチップ化）
// - 送り主: 自由入力（ログイン中はプロフィール名をプリフィル・空のまま送ると「匿名」＝現仕様維持）
// - 保存: portal_thankyou に先頭挿入。onSubmitted で保存後の全件を親へ返す（ホーム/専用ページ共用）

import { useState, useEffect } from "react";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";
import {
  loadDisabledMemberNames,
  loadProfilesIndex,
} from "@/lib/staff-profiles";
import { loadStaffMembers } from "@/lib/staff-tasks";
import { getCurrentActorName } from "@/lib/news-log";
import {
  PORTAL_KEYS,
  normalizeThankyouName,
  type ThankyouItem,
} from "@/types/portal";

export function ThankyouFormModal({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (next: ThankyouItem[]) => void;
}) {
  const [tyToList, setTyToList] = useState<string[]>([]);
  const [tyToInput, setTyToInput] = useState("");
  const [tyCandidates, setTyCandidates] = useState<string[]>([]);
  const [tyFrom, setTyFrom] = useState("");
  const [tyMessage, setTyMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 宛先候補 = メンバー紹介のプロフィール名（五十音順） ∪ スタッフ名簿（登録順）。
  // 正規化名で重複除去。モーダルを開いた時に読み込む。
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [profiles, members, disabled] = await Promise.all([
        loadProfilesIndex().catch(() => []),
        loadStaffMembers().catch(() => []),
        // staff_members は名前だけの名簿でアカウントと紐づかないため、
        // プロフィール側の除外だけでは無効化された人が残る。名前でも弾く。
        loadDisabledMemberNames().catch(() => [] as string[]),
      ]);
      const off = new Set(disabled.map((n) => normalizeThankyouName(n)));
      const seen = new Set<string>();
      const names: string[] = [];
      for (const raw of [...profiles.map((p) => p.name), ...members]) {
        const name = (raw ?? "").trim();
        const key = normalizeThankyouName(name);
        if (!key || seen.has(key) || off.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
      setTyCandidates(names);
    })().catch(() => {});
    // あなたの名前: ログイン中ならプロフィール名でプリフィル（未入力時のみ）
    getCurrentActorName()
      .then((name) => {
        if (name) setTyFrom((prev) => prev || name);
      })
      .catch(() => {});
  }, [open]);

  // 宛先チップの追加/解除（正規化名で同一判定）
  const toggleTyTo = (name: string) => {
    const key = normalizeThankyouName(name);
    setTyToList((prev) =>
      prev.some((n) => normalizeThankyouName(n) === key)
        ? prev.filter((n) => normalizeThankyouName(n) !== key)
        : [...prev, name]
    );
  };

  // 自由入力 → Enter/追加ボタンでチップ化（候補に無い名前のフォールバック）
  const addTyToFromInput = () => {
    const name = tyToInput.trim();
    if (!name) return;
    const key = normalizeThankyouName(name);
    setTyToList((prev) =>
      prev.some((n) => normalizeThankyouName(n) === key) ? prev : [...prev, name]
    );
    setTyToInput("");
  };

  // ありがとうカード投稿（新規は toName を配列で保存。旧データの単一文字列は読み取り側で両対応）
  const handleThankyouSubmit = async () => {
    if (tyToList.length === 0 || !tyMessage.trim()) return;
    setSubmitting(true);
    try {
      const current = await loadPortalItems<ThankyouItem>(
        PORTAL_KEYS.thankyou,
        []
      );
      const newItem: ThankyouItem = {
        id: `ty_${Date.now()}`,
        fromName: tyFrom.trim() || "匿名",
        toName: tyToList,
        message: tyMessage.trim(),
        createdAt: new Date().toISOString(),
      };
      const next = [newItem, ...current];
      const ok = await savePortalItems(PORTAL_KEYS.thankyou, next);
      if (!ok) {
        alert("送信に失敗しました");
        return;
      }
      onSubmitted?.(next);
      setTyToList([]);
      setTyToInput("");
      setTyFrom("");
      setTyMessage("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-900">
            ありがとうカードを送る
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 text-xl"
          >
            ✕
          </button>
        </div>
        <div>
          <label className="text-xs text-gray-800 mb-1 block">
            宛先（誰に感謝しますか？・複数選択できます）
          </label>
          {/* 選択済みチップ（×で解除） */}
          {tyToList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tyToList.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-pink-100 text-pink-800 rounded-full text-xs"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => toggleTyTo(name)}
                    className="text-pink-500 hover:text-pink-700 leading-none"
                    aria-label={`${name} を宛先から外す`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* 候補（タップで追加/解除） */}
          {tyCandidates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 max-h-28 overflow-y-auto">
              {tyCandidates.map((name) => {
                const selected = tyToList.some(
                  (n) =>
                    normalizeThankyouName(n) === normalizeThankyouName(name)
                );
                return (
                  <button
                    type="button"
                    key={name}
                    onClick={() => toggleTyTo(name)}
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      selected
                        ? "bg-pink-500 border-pink-500 text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-pink-50"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {/* 候補に無い名前の自由入力フォールバック（Enter/追加でチップ化） */}
          <div className="flex gap-2">
            <input
              value={tyToInput}
              onChange={(e) => setTyToInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTyToFromInput();
                }
              }}
              placeholder="候補に無い名前はここに入力してEnter"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addTyToFromInput}
              disabled={!tyToInput.trim()}
              className="px-3 py-2 text-sm bg-pink-50 text-pink-700 border border-pink-200 rounded-xl hover:bg-pink-100 disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-800 mb-1 block">
            あなたの名前
          </label>
          <input
            value={tyFrom}
            onChange={(e) => setTyFrom(e.target.value)}
            placeholder="〇〇より"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-800 mb-1 block">
            メッセージ
          </label>
          <textarea
            value={tyMessage}
            onChange={(e) => setTyMessage(e.target.value)}
            rows={3}
            placeholder="感謝の気持ちを伝えましょう..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>
        <button
          type="button"
          onClick={handleThankyouSubmit}
          disabled={tyToList.length === 0 || !tyMessage.trim() || submitting}
          className="w-full py-3 bg-pink-500 text-white rounded-xl text-base font-medium hover:bg-pink-600 disabled:opacity-50"
        >
          ♥ 送る
        </button>
      </div>
    </div>
  );
}
