// ホーム画面「クイックアクセス」の項目定義と表示設定（指示書166 A）
//
// 【構成】
// - 項目のマスター定義（アイコン・名称・リンク先）はここが正本。従来 src/app/page.tsx に
//   ハードコードされていた11項目を移設した（項目の中身は変えていない）。
// - 「どれを表示するか・どの順で並べるか」だけを content_store（portal_quick_access）に保存する。
//   保存形は portal_home_layout と同じ { items: [{ key, order, hidden }] }（section-layout 流儀）。
// - 未保存・取得失敗・不正データのときは既定の11項目・既定順のまま（歯止め5：既定は現状維持）。
//   検証・補完は resolveSectionLayout に委譲（未知キー除去／新項目は末尾補完／空なら既定へ）。
// - 書き込みは管理者のみ（content-store-policy.ts の ADMIN_ONLY_KEYS に登録済み）。

import { AI_INCHO_URL } from "@/lib/external-links";
import {
  resolveSectionLayout,
  type SectionConfig,
} from "@/lib/section-layout";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";

// content_store の id（{ items: [...] } 形式で保存）
export const QUICK_ACCESS_KEY = "portal_quick_access";

// 項目の安定ID。保存データがこのキーで並び・表示を参照するため、改名・振り直し禁止。
export type QuickAccessKey =
  | "knowledge"
  | "diseases"
  | "ai_chat"
  | "operations"
  | "expert"
  | "hiyari"
  | "philosophy"
  | "grade_system"
  | "growth_builder"
  | "quiz"
  | "ai_incho";

export type QuickLinkDef = {
  key: QuickAccessKey;
  icon: string;
  name: string;
  sub: string;
  href: string;
  external?: boolean;
  highlight?: boolean;
};

// マスター定義（従来の11項目・従来順）
export const QUICK_LINK_DEFS: QuickLinkDef[] = [
  {
    key: "knowledge",
    icon: "🏛️",
    name: "組織知識ベース",
    sub: "マニュアル・スキルマップ",
    href: "/knowledge",
  },
  {
    key: "diseases",
    icon: "📚",
    name: "医療知識",
    sub: "疾患・薬剤・生物学的製剤",
    href: "/diseases",
  },
  {
    key: "ai_chat",
    icon: "🤖",
    name: "AI相談",
    sub: "チャット・症例・ロールプレイ",
    href: "/ai-chat",
  },
  {
    key: "operations",
    icon: "✅",
    name: "業務チェック",
    sub: "ロール別チェックリスト",
    href: "/operations",
  },
  {
    key: "expert",
    icon: "⭐",
    name: "エキスパート",
    sub: "成長ロードマップ",
    href: "/expert",
  },
  {
    key: "hiyari",
    icon: "💛",
    name: "気づきシェア",
    sub: "ヒヤリハット・良いこと",
    href: "#hiyari",
  },
  {
    key: "philosophy",
    icon: "🌱",
    name: "理念・想い",
    sub: "理念・8原則",
    href: "/philosophy",
  },
  {
    key: "grade_system",
    icon: "📊",
    name: "等級制度",
    sub: "G1〜G5・評価項目",
    href: "/grade-system",
  },
  {
    key: "growth_builder",
    icon: "🚀",
    name: "成長ロードマップ",
    sub: "AIでスキル・知識を一括生成",
    href: "/growth-builder",
  },
  {
    key: "quiz",
    icon: "📖",
    name: "学習",
    sub: "クイズ・症例学習",
    href: "/quiz",
  },
  {
    key: "ai_incho",
    icon: "👨‍⚕️",
    name: "AI院長",
    sub: "判断基準・理念を確認",
    href: AI_INCHO_URL,
    external: true,
    highlight: true,
  },
];

export type QuickAccessConfig = SectionConfig<QuickAccessKey>;

// 管理画面（SectionLayoutEditor）用ラベル
// ※「気づきシェア」は機能フラグ hiyari ON のときスタッフ側で「良いこと共有」表示になるため併記
export const QUICK_ACCESS_LABELS: Record<QuickAccessKey, string> = {
  knowledge: "🏛️ 組織知識ベース",
  diseases: "📚 医療知識",
  ai_chat: "🤖 AI相談",
  operations: "✅ 業務チェック",
  expert: "⭐ エキスパート",
  hiyari: "💛 気づきシェア（良いこと共有）",
  philosophy: "🌱 理念・想い",
  grade_system: "📊 等級制度",
  growth_builder: "🚀 成長ロードマップ",
  quiz: "📖 学習",
  ai_incho: "👨‍⚕️ AI院長",
};

// 既定：現在の11項目・現在の並び順・すべて表示
export const DEFAULT_QUICK_ACCESS_LAYOUT: QuickAccessConfig[] =
  QUICK_LINK_DEFS.map((def, i) => ({ key: def.key, order: i }));

export function resolveQuickAccessLayout(
  saved: QuickAccessConfig[] | null | undefined
): QuickAccessConfig[] {
  return resolveSectionLayout(saved, DEFAULT_QUICK_ACCESS_LAYOUT);
}

// スタッフ側表示用：保存設定を適用した表示項目（非表示除外・並び順反映）
export function applyQuickAccessLayout(
  saved: QuickAccessConfig[] | null | undefined
): QuickLinkDef[] {
  const byKey = new Map(QUICK_LINK_DEFS.map((d) => [d.key, d]));
  return resolveQuickAccessLayout(saved)
    .filter((s) => !s.hidden)
    .map((s) => byKey.get(s.key))
    .filter((d): d is QuickLinkDef => !!d);
}

export async function loadQuickAccessLayout(): Promise<QuickAccessConfig[]> {
  const saved = await loadPortalItems<QuickAccessConfig>(QUICK_ACCESS_KEY, []);
  return resolveQuickAccessLayout(saved);
}

export async function saveQuickAccessLayout(
  layout: QuickAccessConfig[]
): Promise<boolean> {
  return savePortalItems(QUICK_ACCESS_KEY, layout);
}
