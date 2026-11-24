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
  | "michishirube"
  | "presurvey"
  | "basic";

export type GrowthTab = { key: GrowthTabKey; label: string; short: string };

/**
 * 並びはこの順で固定（220 §2-2 → 第3便で5つに束ねた）。
 * 中身・見られる人は変えず、**入口の数を減らしただけ**:
 * - 目標と成長 = 目標＋道しるべ（スイッチ michishirube に従う）＋現在地（院長だけ）
 * - 1on1・面談 = 1on1＋事前アンケート＋フィードバック
 * - 基本情報・連絡先 = 連絡先（院長と指名された人）＋採用資料・経歴（院長だけ）
 * 各区画を見られる人の判定は今までのまま（区画側・サーバー側で行う）。
 */
export const GROWTH_TABS: GrowthTab[] = [
  { key: "overview", label: "📋 概要", short: "概要" },
  { key: "basic", label: "📇 基本情報・連絡先", short: "基本情報" },
  { key: "goals", label: "🎯 目標と成長", short: "目標と成長" },
  { key: "one_on_one", label: "🤝 1on1・面談", short: "1on1" },
  { key: "learning", label: "📚 研修・学び", short: "研修・学び" },
];

/** 旧タブ（端末に覚えた値・画面内の「もっと見る」）→ 束ねた先 */
export const GROWTH_TAB_ALIAS: Partial<Record<GrowthTabKey, GrowthTabKey>> = {
  position: "goals",
  michishirube: "goals",
  presurvey: "one_on_one",
  feedback: "one_on_one",
};

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
  // 端末が旧タブ名（道しるべ・現在地・アンケート・フィードバック）を覚えていたら、束ねた先に読み替える
  const mapped = GROWTH_TAB_ALIAS[remembered as GrowthTabKey] ?? remembered;
  const hit = tabs.find((t) => t.key === mapped);
  return hit ? hit.key : (tabs[0]?.key ?? "overview");
}

/** その端末で開いていたタブを覚えておく場所（画面ごとに分ける） */
export const GROWTH_TAB_STORAGE_KEY = {
  staff: "mk-growth-tab-staff",
  my: "mk-growth-tab-my",
} as const;
