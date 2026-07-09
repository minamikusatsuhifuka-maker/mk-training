// ページ内セクションの並び順設定（content_store 保存）の汎用ヘルパ
// 指示書26の portal_home_layout（resolveHomeLayout）を汎用化したもの。
// ホーム画面（src/types/portal.ts）と /tasks の両方がこの1つの実装を使う。

export type SectionConfig<K extends string = string> = {
  key: K;
  order: number;
  hidden?: boolean;
};

// 保存済み設定を検証・補完する。空/不正なら既定順に丸ごとフォールバック（ページが壊れない）。
// 保存済み設定に無いキー（将来追加されたセクション）は末尾に自動追加する。
export function resolveSectionLayout<K extends string>(
  saved: SectionConfig<K>[] | null | undefined,
  defaults: SectionConfig<K>[]
): SectionConfig<K>[] {
  const validKeys = new Set<K>(defaults.map((s) => s.key));

  const valid = Array.isArray(saved)
    ? saved.filter(
        (s): s is SectionConfig<K> =>
          !!s && typeof s.order === "number" && validKeys.has(s.key)
      )
    : [];

  const seen = new Set<K>();
  const deduped = valid.filter((s) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });

  if (deduped.length === 0) return defaults;

  const sorted = [...deduped].sort((a, b) => a.order - b.order);
  const missing = defaults.filter((s) => !seen.has(s.key));
  return [...sorted, ...missing];
}

// スタッフ側表示用：非表示を除いたキーの描画順配列
export function visibleSectionKeys<K extends string>(
  saved: SectionConfig<K>[] | null | undefined,
  defaults: SectionConfig<K>[]
): K[] {
  return resolveSectionLayout(saved, defaults)
    .filter((s) => !s.hidden)
    .map((s) => s.key);
}

// ─────────────────────────────────────
// みんなのタスク（/tasks）のセクション並び順設定
// 管理画面「ポータル管理→レイアウト」タブで編集
// ─────────────────────────────────────

// content_store の id（{ items: [...] } 形式で保存）
export const TASKS_PAGE_LAYOUT_KEY = "tasks_page_layout";

export type TasksSectionKey = "add_form" | "ai_import" | "summary" | "task_list";

export type TasksSectionConfig = SectionConfig<TasksSectionKey>;

export const TASKS_SECTION_LABELS: Record<TasksSectionKey, string> = {
  summary: "🔢 件数サマリー（超過/今日/未完了/完了）",
  task_list: "📋 タスク一覧（ビュー切替ツールバー含む）",
  add_form: "➕ タスクを追加フォーム",
  ai_import: "🤖 ファイルからAIでタスク化（β）",
};

// 新しい既定順：開いてすぐ「いまのタスク状況」が見え、追加系は下方に
export const DEFAULT_TASKS_LAYOUT: TasksSectionConfig[] = [
  { key: "summary", order: 0 },
  { key: "task_list", order: 1 },
  { key: "add_form", order: 2 },
  { key: "ai_import", order: 3 },
];

export function resolveTasksLayout(
  saved: TasksSectionConfig[] | null | undefined
): TasksSectionConfig[] {
  return resolveSectionLayout(saved, DEFAULT_TASKS_LAYOUT);
}

export function visibleTasksSectionKeys(
  saved: TasksSectionConfig[] | null | undefined
): TasksSectionKey[] {
  return visibleSectionKeys(saved, DEFAULT_TASKS_LAYOUT);
}
