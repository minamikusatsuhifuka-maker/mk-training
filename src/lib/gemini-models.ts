import type { SupabaseClient } from "@supabase/supabase-js";

// 管理画面の評価・分析機能で使用する Gemini モデル候補
export const GEMINI_MODELS = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash（推奨・高速）",
    desc: "最新・高速・低コスト。日常利用に最適",
  },
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro（高精度）",
    desc: "最高精度・2Mコンテキスト。複雑な評価向け",
  },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.5-flash";

// content_store の id（モデル設定の保存先）
export const GEMINI_MODEL_SETTING_KEY = "gemini_model_setting";

// Gemini 3.x は思考(thinking)が既定でON。枠固定のJSON抽出（正規表現抽出＋
// maxOutputTokens固定）が途中で切れるため、思考を最小化して安定させる。
// 参照: 過去の知見 env_gemini3_thinking
export const GEMINI_THINKING_CONFIG = { thinkingLevel: "minimal" } as const;

// 現在選択中のモデルを content_store から取得（未設定・失敗時はデフォルト）
export async function getSelectedGeminiModel(
  supabase: SupabaseClient
): Promise<string> {
  try {
    const { data } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", GEMINI_MODEL_SETTING_KEY)
      .single();
    const model = (data?.data as { model?: string } | null)?.model;
    return model || DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}
