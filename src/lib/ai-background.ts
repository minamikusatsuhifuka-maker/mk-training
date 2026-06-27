// AI共通の背景情報（理念・方針）— 唯一の編集場所
// content_store キー ai_background_context（{ text } 形式で保存）に集約し、
// スタッフ向け主要AI機能のシステムプロンプト冒頭へ共通注入する。
import { createClient } from "@supabase/supabase-js";

export const AI_BACKGROUND_KEY = "ai_background_context";

// 注入時の上限（極端に長い場合のトークン暴発を防ぐ）
const MAX_BG_CHARS = 6000;

// 背景情報の本文（Markdown）を取得。未設定・失敗時は空文字。
export async function getAiBackgroundContext(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "";
  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", AI_BACKGROUND_KEY)
      .single();
    const raw = data?.data as { text?: string } | string | null;
    const text = typeof raw === "string" ? raw : raw?.text ?? "";
    return (text || "").trim();
  } catch {
    return "";
  }
}

// 背景情報を見出し付きブロックに整形。空なら空文字（ブロックごと省略）。
export function buildAiBackgroundBlock(bg: string): string {
  const trimmed = (bg || "").trim();
  if (!trimmed) return "";
  const capped =
    trimmed.length > MAX_BG_CHARS ? trimmed.slice(0, MAX_BG_CHARS) : trimmed;
  return (
    `## 南草津皮フ科の理念・方針（共通背景）\n` +
    `${capped}\n` +
    `— 回答・演技・指導・生成は、この理念と方針に沿って行ってください。\n\n`
  );
}

// 取得＋整形をまとめて行う。各AI route の冒頭で await して prepend する。
export async function getAiBackgroundBlock(): Promise<string> {
  return buildAiBackgroundBlock(await getAiBackgroundContext());
}
