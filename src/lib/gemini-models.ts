// 145: content_store は RLS 有効のため service-role 経由で読む（サーバー専用）。
import { serverGetContentRow } from "./content-store-server";

// 管理画面の評価・分析機能で使用する Gemini モデル候補
export const GEMINI_MODELS = [
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash（推奨・高速）",
    desc: "最新・高速・低コスト。日常利用に最適",
  },
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro（高精度）",
    desc: "最高精度・2Mコンテキスト。複雑な評価向け",
  },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

// 旧: "gemini-3.5-flash"（問題発生時はこの1行を戻す）
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.6-flash";

// content_store の id（モデル設定の保存先）
export const GEMINI_MODEL_SETTING_KEY = "gemini_model_setting";

// Gemini 3.x は思考(thinking)が既定でON。枠固定のJSON抽出（正規表現抽出＋
// maxOutputTokens固定）が途中で切れるため、思考を最小化して安定させる。
// 参照: 過去の知見 env_gemini3_thinking
export const GEMINI_THINKING_CONFIG = { thinkingLevel: "minimal" } as const;

// 保存値が現行候補に含まれるかを判定（廃止済みモデルIDの残留対策）
export function isKnownGeminiModel(model: string): boolean {
  return GEMINI_MODELS.some((m) => m.id === model);
}

// 現在選択中のモデルを content_store から取得（未設定・失敗時はデフォルト）
// 保存値が候補外（例: 廃止済みの gemini-3.5-flash）の場合もデフォルトへフォールバックする
export async function getSelectedGeminiModel(): Promise<string> {
  try {
    const row = await serverGetContentRow(GEMINI_MODEL_SETTING_KEY);
    const model = (row?.data as { model?: string } | null)?.model;
    return model && isKnownGeminiModel(model) ? model : DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}
