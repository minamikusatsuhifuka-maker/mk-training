// 可能性ノートの画面のタブ（指示書220 §2-2・§3）— 純関数
//
// 院長・担当の幹部が見る「可能性ノート」と、本人の「わたしの可能性ノート」で
// **同じ並び**にそろえる。見られないタブは出さない（判定はサーバー側の結果を受け取るだけ）。
//
// 中身は今までのものをそのまま移しただけで、見られる人・データは変えていない（220 §4）。

export type GrowthTabKey =
  | "overview"
  | "goals"
  | "one_on_one"
  | "feedback"
  | "learning"
  | "position"
  | "presurvey"
  | "basic";

export type GrowthTab = { key: GrowthTabKey; label: string; short: string };

/** 並びはこの順で固定（220 §2-2） */
export const GROWTH_TABS: GrowthTab[] = [
  { key: "overview", label: "📋 概要", short: "概要" },
  { key: "goals", label: "🎯 目標", short: "目標" },
  { key: "one_on_one", label: "🤝 1on1", short: "1on1" },
  { key: "feedback", label: "🌟 フィードバック", short: "フィードバック" },
  { key: "learning", label: "📚 学び", short: "学び" },
  { key: "position", label: "🧭 現在地", short: "現在地" },
  { key: "presurvey", label: "📝 アンケート", short: "アンケート" },
  { key: "basic", label: "🔒 基本情報", short: "基本情報" },
];

export function growthTabLabel(key: GrowthTabKey): string {
  return GROWTH_TABS.find((t) => t.key === key)?.label ?? key;
}

/**
 * 出すタブを決める。`allow` に無いものは**出さない**（220 §2-2）。
 * 例: 担当の幹部には「現在地」「基本情報」を出さない。「アンケート」は委任と担当がそろうときだけ。
 */
export function visibleGrowthTabs(allow: Partial<Record<GrowthTabKey, boolean>>): GrowthTab[] {
  return GROWTH_TABS.filter((t) => allow[t.key] !== false);
}

/** 覚えていたタブが今は見られないときは、先頭（概要）に戻す */
export function resolveGrowthTab(
  remembered: string,
  tabs: readonly GrowthTab[]
): GrowthTabKey {
  const hit = tabs.find((t) => t.key === remembered);
  return hit ? hit.key : (tabs[0]?.key ?? "overview");
}

/** その端末で開いていたタブを覚えておく場所（画面ごとに分ける） */
export const GROWTH_TAB_STORAGE_KEY = {
  staff: "mk-growth-tab-staff",
  my: "mk-growth-tab-my",
} as const;
