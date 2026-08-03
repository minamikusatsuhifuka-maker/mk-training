"use client";

// 管理画面の一括選択・一括削除の共通部品（指示書128）
// - 対象10タブすべてがこの1本を使う（重複実装禁止）。
// - 選択状態はタブ切替・再読み込みでリセット（ページ側で tab 変更時に clear() を呼ぶ）。
// - 確認文言は bulkConfirmMessage に集約（件数＋削除種別を必ず明示）。

import { useCallback, useState } from "react";

export type BulkSelectionController = {
  selected: Set<string>;
  count: number;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
};

export function useBulkSelection(): BulkSelectionController {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, count: selected.size, toggle, selectAll, clear };
}

// 確認ダイアログの共通文言（件数＋削除種別を必ず明示・指示書128）
export function bulkConfirmMessage(
  count: number,
  kind: "logical" | "hard"
): string {
  return kind === "logical"
    ? `選択した ${count}件 を削除しますか？（♻️ あとで復元できます）`
    : `⚠️ 選択した ${count}件 を完全に削除しますか？（復元できません）`;
}

// 各行のチェックボックス（行クリックと干渉しないよう伝播を止める）
export function BulkCheckbox({
  id,
  ctl,
}: {
  id: string;
  ctl: BulkSelectionController;
}) {
  return (
    <input
      type="checkbox"
      checked={ctl.selected.has(id)}
      onChange={() => ctl.toggle(id)}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 shrink-0 rounded cursor-pointer"
      aria-label="一括操作の選択"
    />
  );
}

// 全選択・解除トグル（対象は表示中一覧のID）
export function BulkSelectAllButton({
  ids,
  ctl,
}: {
  ids: string[];
  ctl: BulkSelectionController;
}) {
  const allSelected =
    ids.length > 0 && ids.every((id) => ctl.selected.has(id));
  return (
    <button
      type="button"
      onClick={() => (allSelected ? ctl.clear() : ctl.selectAll(ids))}
      className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 shrink-0"
    >
      {allSelected ? "☑ 全解除" : "☐ 全選択"}
    </button>
  );
}

// 選択中のみ表示する画面下部固定バー（実行中はボタン無効化＝二度押し防止）
export function BulkActionBar({
  ctl,
  busy,
  onDelete,
}: {
  ctl: BulkSelectionController;
  busy: boolean;
  onDelete: () => void;
}) {
  if (ctl.count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-full shadow-xl px-4 py-2.5 flex items-center gap-3">
      <span className="text-sm font-medium whitespace-nowrap">
        {ctl.count}件選択中
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="text-sm px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-full disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? "削除中…" : "🗑 選択した投稿を削除"}
      </button>
      <button
        type="button"
        onClick={ctl.clear}
        disabled={busy}
        className="text-xs text-gray-300 hover:text-white disabled:opacity-50"
      >
        解除
      </button>
    </div>
  );
}
