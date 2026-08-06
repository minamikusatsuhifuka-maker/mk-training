// 分かち愛マンスリーダイジェスト（指示書146-C）
// その月の「ありがとうカード・日々の気づき・良いこと共有」を1枚にまとめる。
//
// 設計方針（指示書の制約をコードで担保する）:
// - **AIで文章を作らない**。実投稿の本文をそのまま抜粋するだけ。要約・言い換えはしない。
// - **個人別の件数・順位・ランキングは出さない**（選択理論: 比較・褒美で釣らない）。
//   出すのは「全体の件数」と「抜粋カード」のみ。投稿者名は抜粋カードに添えるが、
//   誰が何件出したかを集計・比較できる形では一切見せない。
// - 論理削除済みは除外。匿名投稿は匿名のまま。
// - 保存はしない（表示時に既存データから動的生成）。生成物を持たないので
//   元投稿を消せばダイジェストからも自動的に消える＝データの二重管理を作らない。

import { loadKizukiStore, visibleKizukiPosts } from "./kizuki";
import { loadPortalItems } from "./portal-store";
import {
  PORTAL_KEYS,
  thankyouToNames,
  type HiyariItem,
  type ThankyouItem,
} from "@/types/portal";

/** 抜粋として出すカードの上限（各種別ごと） */
export const DIGEST_EXCERPT_MAX = 3;

export type DigestExcerpt = {
  id: string;
  /** 表示する本文（実投稿そのまま・整形なし） */
  text: string;
  /** 添える人名。匿名投稿・記名なしは null */
  who: string | null;
  createdAt: string;
};

export type MonthlyDigest = {
  ym: string;
  counts: { thankyou: number; kizuki: number; good: number; total: number };
  thankyou: DigestExcerpt[];
  kizuki: DigestExcerpt[];
  good: DigestExcerpt[];
};

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ymOf(iso: string): string {
  // createdAt は ISO 文字列。端末のローカル時刻で暦月を判定する（JST運用）
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatYmJa(ym: string): string {
  if (!YM_RE.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

/** 前月の ym（月初に「前月分」を見せる既定） */
export function previousYm(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function newestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/**
 * 指定月のダイジェストを組み立てる。
 * 抜粋の選び方は機械的ルール（新しい順に上限まで）で固定。恣意的な選別をしない。
 */
export async function buildMonthlyDigest(ym: string): Promise<MonthlyDigest> {
  const [thankyouAll, hiyariAll, kizukiStore] = await Promise.all([
    loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
    loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
    loadKizukiStore(),
  ]);

  // ありがとうカード: deleted 除外・当月分のみ
  const thankyou = newestFirst(
    thankyouAll.filter((t) => !t.deleted && ymOf(t.createdAt) === ym)
  );
  // 日々の気づき: visibleKizukiPosts が deleted 除外＋新着順を担保
  const kizuki = visibleKizukiPosts(kizukiStore.posts).filter(
    (p) => ymOf(p.createdAt) === ym
  );
  // 良いこと共有: type=good のみ（ヒヤリハットは対象外）。この型に論理削除は無い
  const good = newestFirst(
    hiyariAll.filter((h) => h.type === "good" && ymOf(h.createdAt) === ym)
  );

  return {
    ym,
    counts: {
      thankyou: thankyou.length,
      kizuki: kizuki.length,
      good: good.length,
      total: thankyou.length + kizuki.length + good.length,
    },
    thankyou: thankyou.slice(0, DIGEST_EXCERPT_MAX).map((t) => ({
      id: t.id,
      text: t.message,
      // 宛先は「◯◯さんへ」として添える。送り主は匿名運用があるため出さない
      who: thankyouToNames(t).join("・") || null,
      createdAt: t.createdAt,
    })),
    kizuki: kizuki.slice(0, DIGEST_EXCERPT_MAX).map((p) => ({
      id: p.id,
      text: p.body,
      who: p.authorName || null,
      createdAt: p.createdAt,
    })),
    good: good.slice(0, DIGEST_EXCERPT_MAX).map((h) => ({
      id: h.id,
      text: h.text,
      // 匿名投稿は匿名のまま（役職も出さない）
      who: h.isAnonymous ? null : h.role || null,
      createdAt: h.createdAt,
    })),
  };
}

/** 投稿が1件でもある月の一覧（新しい順・簡易アーカイブの選択肢に使う） */
export async function listDigestMonths(): Promise<string[]> {
  const [thankyouAll, hiyariAll, kizukiStore] = await Promise.all([
    loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
    loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
    loadKizukiStore(),
  ]);
  const set = new Set<string>();
  for (const t of thankyouAll) {
    if (!t.deleted) set.add(ymOf(t.createdAt));
  }
  for (const h of hiyariAll) {
    if (h.type === "good") set.add(ymOf(h.createdAt));
  }
  for (const p of visibleKizukiPosts(kizukiStore.posts)) {
    set.add(ymOf(p.createdAt));
  }
  set.delete("");
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}
