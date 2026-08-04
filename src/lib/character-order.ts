"use client";

// キャラクター選択肢の表示順（指示書137）
// - ラベル定義をここに一元化（従来はホーム/管理に重複定義されていたものを集約）。
// - 表示順は content_store キー character_order（{ order: [...] }）に保存。
//   キー無し・取得失敗・不正時は既定順（オリジナル7体→既存17種）にフォールバック。
// - 並びは表示だけの設定。ID・保存値は不変＝既存投稿への影響ゼロ。
// - 「おまかせ」はこのリストに含めない（各フォームで常に先頭固定・並び替え対象外）。

import { loadPortalObject, savePortalObject } from "./portal-store";
import type { CharacterSvgType } from "@/types/portal";

export const CHARACTER_ORDER_KEY = "character_order";

export type CharacterChoice = { type: CharacterSvgType; label: string };

// 既定順: オリジナル7体 → 既存17種（指示書137）
export const CHARACTER_CHOICES: CharacterChoice[] = [
  { type: "mochi", label: "もちうさ" },
  { type: "happa", label: "はっぱまる" },
  { type: "kumopi", label: "くもぴ" },
  { type: "piyomaru", label: "ぴよまる" },
  { type: "kogumaro", label: "こぐまろ" },
  { type: "azaran", label: "あざらん" },
  { type: "rakkon", label: "らっこん" },
  { type: "cat", label: "ねこ" },
  { type: "dog", label: "いぬ" },
  { type: "rabbit", label: "うさぎ" },
  { type: "bird", label: "とり" },
  { type: "chihuahua", label: "ブラックタンチワワ" },
  { type: "sakura", label: "さくら" },
  { type: "sprout", label: "ふたば" },
  { type: "star", label: "ほし" },
  { type: "moon", label: "つき" },
  { type: "shiba", label: "しばいぬ" },
  { type: "panda", label: "ぱんだ" },
  { type: "penguin", label: "ぺんぎん" },
  { type: "hedgehog", label: "はりねずみ" },
  { type: "rainbow", label: "にじ" },
  { type: "note", label: "おんぷ" },
  { type: "clover", label: "クローバー" },
  { type: "butterfly", label: "ちょうちょ" },
];

// 保存された並び（unknown）を choices に適用。未知IDは無視・欠落IDは既定順で末尾に補完
export function applyCharacterOrder(saved: unknown): CharacterChoice[] {
  const raw = (saved as { order?: unknown } | null)?.order;
  if (!Array.isArray(raw)) return CHARACTER_CHOICES;
  const byType = new Map(CHARACTER_CHOICES.map((c) => [c.type, c]));
  const out: CharacterChoice[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const c = byType.get(t as CharacterSvgType);
    if (c && !out.includes(c)) out.push(c);
  }
  for (const c of CHARACTER_CHOICES) {
    if (!out.includes(c)) out.push(c); // 新キャラ追加時も自動で末尾に現れる
  }
  return out;
}

export async function loadCharacterOrderedChoices(): Promise<CharacterChoice[]> {
  try {
    const saved = await loadPortalObject<unknown>(CHARACTER_ORDER_KEY, null);
    return applyCharacterOrder(saved);
  } catch {
    return CHARACTER_CHOICES;
  }
}

export async function saveCharacterOrder(
  order: CharacterSvgType[]
): Promise<boolean> {
  return savePortalObject(CHARACTER_ORDER_KEY, {
    order,
    updatedAt: new Date().toISOString(),
  });
}
