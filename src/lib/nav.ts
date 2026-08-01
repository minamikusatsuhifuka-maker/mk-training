// サイドバー（スタッフポータル）のナビ構成
// マスター（ハードコードの既定）＝各メニューの安定ID(key=ルート)・ラベル・所属カテゴリ。
// content_store(portal_nav_config) は「その上の配置情報」。設定が無い/壊れていればマスターにフォールバックする。

import { AI_INCHO_URL } from "./external-links";
import type { FeatureId, FeatureFlags } from "./feature-flags";

export const NAV_CONFIG_KEY = "portal_nav_config";
export const UNCATEGORIZED_ID = "uncategorized";
export const UNCATEGORIZED_LABEL = "未分類";

// --- マスター（既定構成） ---
export type MasterCategory = { id: string; label: string };
// external: true の項目は外部URL（別タブで開く。key はルートでなく一意ID）。指示書59
// featureId: 機能フラグ連動（指示書103）。指定した項目はフラグOFFのときナビに表示されない。
//   portal_nav_config の保存形状（key ベース）は変えない＝後方互換。
export type MasterItem = {
  key: string;
  href: string;
  label: string;
  categoryId: string;
  external?: true;
  featureId?: FeatureId;
};

export const MASTER_CATEGORIES: MasterCategory[] = [
  { id: "home", label: "ホーム" },
  { id: "philosophy", label: "理念・想い" },
  { id: "medical", label: "医療知識" },
  { id: "beauty", label: "当院の美容" },
  { id: "work", label: "業務・接遇" },
  { id: "test", label: "確認テスト" },
];

// key = ルート（既存メニューの安定ID）。ルートは変更しない。
export const MASTER_ITEMS: MasterItem[] = [
  { key: "/", href: "/", label: "🏠 ホーム", categoryId: "home" },
  { key: "/members", href: "/members", label: "👥 メンバー紹介", categoryId: "home" },
  // オンボーディングチェックリスト（指示書113。スタッフ向け表示名はやわらかく「はじめてガイド」）
  { key: "/onboarding", href: "/onboarding", label: "✅ はじめてガイド", categoryId: "home", featureId: "onboarding" },
  // 自己評価シート（指示書111・private_store 基盤・本人と院長のみ）
  { key: "/self-review", href: "/self-review", label: "📝 自己評価シート", categoryId: "home", featureId: "self_review" },
  // 1on1ノート（指示書112・private_store 基盤・本人＋ペア相手＋院長のみ）
  { key: "/one-on-one", href: "/one-on-one", label: "🤝 1on1ノート", categoryId: "home", featureId: "one_on_one" },
  // 外部リンク（別タブ）。指示書59
  {
    key: "ai-incho",
    href: AI_INCHO_URL,
    label: "🤖 AI院長",
    categoryId: "home",
    external: true,
  },

  { key: "/philosophy", href: "/philosophy", label: "🏛️ 理念・院長の想い", categoryId: "philosophy" },

  { key: "/knowledge", href: "/knowledge", label: "🏛️ 組織知識ベース", categoryId: "medical" },
  { key: "/diseases", href: "/diseases", label: "疾患", categoryId: "medical" },
  { key: "/drugs", href: "/drugs", label: "薬剤", categoryId: "medical" },
  { key: "/contraindications", href: "/contraindications", label: "禁忌・注意", categoryId: "medical" },
  { key: "/pregnancy", href: "/pregnancy", label: "🤰 妊娠・授乳と薬剤", categoryId: "medical" },
  { key: "/interactions", href: "/interactions", label: "⚡ 相互作用チェック", categoryId: "medical" },
  { key: "/biologics", href: "/biologics", label: "💉 生物学的製剤", categoryId: "medical" },
  { key: "/age-restrictions", href: "/age-restrictions", label: "👶 年齢注意薬剤", categoryId: "medical" },

  { key: "/cosmetic", href: "/cosmetic", label: "美容メニュー", categoryId: "beauty" },
  { key: "/skincare", href: "/skincare", label: "スキンケア", categoryId: "beauty" },
  { key: "/counseling", href: "/counseling", label: "💬 カウンセリングガイド", categoryId: "beauty" },

  { key: "/tasks", href: "/tasks", label: "📋 みんなのタスク", categoryId: "work" },
  { key: "/goals", href: "/goals", label: "🎯 クリニック目標", categoryId: "work" },
  { key: "/news-history", href: "/news-history", label: "📜 お知らせ履歴", categoryId: "work" },
  // 日々の気づき投稿（指示書104）。フラグOFFの間はナビ非表示（featureId 連動・指示書103）
  { key: "/kizuki", href: "/kizuki", label: "💡 日々の気づき", categoryId: "work", featureId: "kizuki" },
  // サンクスカード全件一覧（指示書105・A案=既存 portal_thankyou を核に拡張）
  { key: "/thanks", href: "/thanks", label: "💌 ありがとうカード", categoryId: "work", featureId: "thanks" },
  // ヒヤリハット報告（指示書106。既存「気づきシェア」portal_hiyari とは別機能・別キー hiyari_reports）
  { key: "/hiyari-report", href: "/hiyari-report", label: "🚨 ヒヤリハット報告", categoryId: "work", featureId: "hiyari" },
  // 朝礼サポート（指示書108・投稿駆動の輪番つき）
  { key: "/chorei", href: "/chorei", label: "🌅 朝礼サポート", categoryId: "work", featureId: "chorei" },
  { key: "/operations", href: "/operations", label: "📋 業務チェックリスト", categoryId: "work" },
  { key: "/library", href: "/library", label: "🗂️ 資料庫", categoryId: "work" },
  // マニュアル＝資料庫のカテゴリ絞り込み済みビュー（別ページは作らない・指示書101。key は一意IDで可＝59の流儀）
  { key: "library-manual", href: "/library?category=マニュアル", label: "📖 マニュアル", categoryId: "work" },
  // マニュアル下書き（指示書107）。資料庫系の並びに置く
  { key: "/manual-drafts", href: "/manual-drafts", label: "✍️ マニュアル下書き", categoryId: "work", featureId: "manual_draft" },
  // 勉強会アーカイブ（指示書109・資料は資料庫参照 libraryRefs）
  { key: "/benkyokai", href: "/benkyokai", label: "📖 勉強会アーカイブ", categoryId: "work", featureId: "benkyokai" },
  // 院内カレンダー（指示書114・Googleカレンダー読み取り・管理はGoogle側）
  { key: "/calendar", href: "/calendar", label: "🗓 院内カレンダー", categoryId: "work", featureId: "calendar" },
  { key: "/medical-fees", href: "/medical-fees", label: "💴 算定・点数表", categoryId: "work" },
  { key: "/expert", href: "/expert", label: "⭐ エキスパートの働き方", categoryId: "work" },
  { key: "/growth-builder", href: "/growth-builder", label: "🚀 成長ロードマップ", categoryId: "work" },
  // 以前モバイルのみに存在した役割別ページ（消えないようマスターに保持）
  { key: "/reception", href: "/reception", label: "🏢 受付", categoryId: "work" },
  { key: "/clerk", href: "/clerk", label: "💻 事務", categoryId: "work" },
  { key: "/counselor", href: "/counselor", label: "💬 カウンセラー", categoryId: "work" },

  { key: "/quiz", href: "/quiz", label: "クイズ", categoryId: "test" },
  { key: "/progress", href: "/progress", label: "📊 学習進捗", categoryId: "test" },
  { key: "/ai-chat", href: "/ai-chat", label: "🤖 AIアシスタント", categoryId: "test" },
  { key: "/case-study", href: "/case-study", label: "🏥 症例学習", categoryId: "test" },
  { key: "/roleplay", href: "/roleplay", label: "🎭 ロールプレイ", categoryId: "test" },
];

// --- 設定（content_store に保存する形） ---
export type NavCategory = { id: string; label: string; order: number; hidden?: boolean };
export type NavItemConfig = {
  key: string;
  categoryId: string;
  order: number;
  hidden?: boolean;
  labelOverride?: string;
};
export type NavConfig = { categories: NavCategory[]; items: NavItemConfig[] };

// --- 描画用に解決した形 ---
export type ResolvedItem = {
  key: string;
  href: string;
  label: string;
  external?: true;
};
export type ResolvedCategory = { id: string; label: string; items: ResolvedItem[] };

const masterIndex = new Map(MASTER_ITEMS.map((it, i) => [it.key, i]));

// マスターから既定の config を生成（「現在の構成を初期値として取り込む」用）
export function buildDefaultConfig(): NavConfig {
  return {
    categories: MASTER_CATEGORIES.map((c, i) => ({ id: c.id, label: c.label, order: i })),
    items: MASTER_ITEMS.map((it, i) => ({ key: it.key, categoryId: it.categoryId, order: i })),
  };
}

export const MASTER_ITEM_BY_KEY = new Map(MASTER_ITEMS.map((it) => [it.key, it]));

// 管理画面の編集用に config を正規化する。
// - マスターの全項目を必ず含める（欠けていれば既定カテゴリ末尾に補完）
// - マスターに無い古いキーは捨てる
// - 存在しないカテゴリを指す項目は「未分類」へ退避
// - order を各カテゴリ内で連番に振り直す
export function normalizeConfig(cfg: NavConfig | null | undefined): NavConfig {
  const base = isValidConfig(cfg) ? cfg : buildDefaultConfig();

  let categories = base.categories
    .filter((c) => c && typeof c.id === "string")
    .map((c, i) => ({ id: c.id, label: c.label ?? c.id, order: c.order ?? i, hidden: !!c.hidden }));
  if (categories.length === 0) {
    categories = MASTER_CATEGORIES.map((c, i) => ({ id: c.id, label: c.label, order: i, hidden: false }));
  }

  const catIds = new Set(categories.map((c) => c.id));

  const existing = new Map<string, NavItemConfig>();
  for (const it of base.items ?? []) {
    if (it && typeof it.key === "string" && masterIndex.has(it.key)) existing.set(it.key, it);
  }

  let needUncat = false;
  const items: NavItemConfig[] = MASTER_ITEMS.map((m, i) => {
    const e = existing.get(m.key);
    let categoryId = e?.categoryId ?? m.categoryId;
    if (!catIds.has(categoryId)) {
      categoryId = UNCATEGORIZED_ID;
      needUncat = true;
    }
    return {
      key: m.key,
      categoryId,
      order: e?.order ?? 1000 + i,
      hidden: !!e?.hidden,
      ...(e?.labelOverride ? { labelOverride: e.labelOverride } : {}),
    };
  });

  if (needUncat && !catIds.has(UNCATEGORIZED_ID)) {
    categories.push({ id: UNCATEGORIZED_ID, label: UNCATEGORIZED_LABEL, order: categories.length, hidden: false });
  }

  categories = categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c, i) => ({ ...c, order: i }));

  const byCat = new Map<string, NavItemConfig[]>();
  for (const it of items) {
    if (!byCat.has(it.categoryId)) byCat.set(it.categoryId, []);
    byCat.get(it.categoryId)!.push(it);
  }
  const normItems: NavItemConfig[] = [];
  for (const c of categories) {
    const list = (byCat.get(c.id) ?? []).slice().sort((a, b) => a.order - b.order);
    list.forEach((it, i) => normItems.push({ ...it, order: i }));
  }

  return { categories, items: normItems };
}

function defaultResolved(flags?: FeatureFlags): ResolvedCategory[] {
  return MASTER_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    items: MASTER_ITEMS.filter(
      (it) => it.categoryId === c.id && !isFeatureOff(it, flags)
    ).map((it) => ({
      key: it.key,
      href: it.href,
      label: it.label,
      ...(it.external ? { external: true as const } : {}),
    })),
  }));
}

// 機能フラグでOFFのナビ項目か（指示書103）。
// flags 省略時はフィルタしない（管理画面のナビ編集では全項目を扱うため）。
function isFeatureOff(m: MasterItem, flags?: FeatureFlags): boolean {
  return !!(flags && m.featureId && !flags[m.featureId]);
}

function isValidConfig(cfg: unknown): cfg is NavConfig {
  if (!cfg || typeof cfg !== "object") return false;
  const c = cfg as Partial<NavConfig>;
  return Array.isArray(c.categories) && Array.isArray(c.items);
}

// 「表示名の上書き」の解決（指示書123・正本はここ1箇所）。
// resolveNav（ナビ）と usePageTitle（ページ見出し）の両方がこれを使う。
// 未設定・空白のみ・不正 config は空文字＝呼び出し側の既定名にフォールバック。
export function navLabelOverride(
  cfg: NavConfig | null | undefined,
  key: string
): string {
  if (!isValidConfig(cfg)) return "";
  const it = cfg.items.find((i) => i && i.key === key);
  return it?.labelOverride?.trim() ?? "";
}

// config を解決して描画用カテゴリ配列を返す。
// 不正・未設定はマスター（既定）にフォールバック。マスターにあって config に無い項目は既定カテゴリ末尾に自動表示。
// flags を渡すと機能フラグOFFの項目を除外する（指示書103・省略時は全項目）。
export function resolveNav(
  cfg: NavConfig | null | undefined,
  flags?: FeatureFlags
): ResolvedCategory[] {
  try {
    if (!isValidConfig(cfg)) return defaultResolved(flags);

    // 表示するカテゴリ（hidden除外、order順）
    const visibleCats = cfg.categories
      .filter((c) => c && typeof c.id === "string" && !c.hidden)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const catExists = new Map(cfg.categories.map((c) => [c.id, c]));
    const visibleCatIds = new Set(visibleCats.map((c) => c.id));

    const itemByKey = new Map<string, NavItemConfig>();
    for (const it of cfg.items) {
      if (it && typeof it.key === "string") itemByKey.set(it.key, it);
    }

    // バケツ: categoryId -> {item, order}
    const buckets = new Map<string, { item: ResolvedItem; order: number }[]>();
    const pushTo = (catId: string, item: ResolvedItem, order: number) => {
      if (!buckets.has(catId)) buckets.set(catId, []);
      buckets.get(catId)!.push({ item, order });
    };

    let needsUncategorized = false;

    for (const m of MASTER_ITEMS) {
      if (isFeatureOff(m, flags)) continue; // 機能フラグOFFはナビ非表示（指示書103）
      const conf = itemByKey.get(m.key);
      const resolved: ResolvedItem = {
        key: m.key,
        href: m.href,
        // 上書き解決は navLabelOverride に一元化（指示書123）
        label: navLabelOverride(cfg, m.key) || m.label,
        ...(m.external ? { external: true as const } : {}),
      };

      if (conf) {
        if (conf.hidden) continue; // 非表示
        // 所属カテゴリが存在し表示中ならそこへ。隠れ/未存在なら退避。
        if (visibleCatIds.has(conf.categoryId)) {
          pushTo(conf.categoryId, resolved, conf.order ?? 9999);
        } else if (catExists.has(conf.categoryId)) {
          // カテゴリ自体が hidden → 項目も非表示扱い
          continue;
        } else {
          needsUncategorized = true;
          pushTo(UNCATEGORIZED_ID, resolved, conf.order ?? 9999);
        }
      } else {
        // config に無い新規ページ → 既定カテゴリ末尾に自動表示（無ければ未分類）
        const order = 100000 + (masterIndex.get(m.key) ?? 0);
        if (visibleCatIds.has(m.categoryId)) {
          pushTo(m.categoryId, resolved, order);
        } else {
          needsUncategorized = true;
          pushTo(UNCATEGORIZED_ID, resolved, order);
        }
      }
    }

    const result: ResolvedCategory[] = visibleCats.map((c) => ({
      id: c.id,
      label: c.label,
      items: (buckets.get(c.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((x) => x.item),
    }));

    if (needsUncategorized && buckets.has(UNCATEGORIZED_ID)) {
      result.push({
        id: UNCATEGORIZED_ID,
        label: UNCATEGORIZED_LABEL,
        items: buckets
          .get(UNCATEGORIZED_ID)!
          .sort((a, b) => a.order - b.order)
          .map((x) => x.item),
      });
    }

    // 何も表示できなくなる事故を防ぐ（安全網）
    const total = result.reduce((s, c) => s + c.items.length, 0);
    if (total === 0) return defaultResolved(flags);

    return result;
  } catch {
    return defaultResolved(flags);
  }
}
