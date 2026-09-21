// Gemini モデルの正本（指示書175: 全AI機能を gemini-3.8-flash に統一）
//
// 【1か所に集約】
// 文章生成にAIを使うすべての機能（callAI 経由・直接 fetch している route・ディープリサーチ）は
// ここの DEFAULT_GEMINI_MODEL / getSelectedGeminiModel() からモデル名を引く。機能ごとの直書きはしない。
// 次にモデルを替えるときは、このファイルの GEMINI_MODELS と DEFAULT_GEMINI_MODEL だけを直す。
//
// 【失敗時に別モデルへ黙って切り替えない】
// 呼び出し側はエラーをそのまま返し、利用者が再実行できるようにする（175-4）。
//
// 145: content_store は RLS 有効のため service-role 経由で読む（サーバー専用）。
import { serverGetContentRow } from "./content-store-server";

// 管理画面で選べる Gemini モデル候補。175で gemini-3.8-flash の1択に統一した。
// （旧候補 gemini-3.6-flash / gemini-3.1-pro は候補から外した。保存値が残っていても
//   isKnownGeminiModel で候補外と判定され、DEFAULT_GEMINI_MODEL に倒れる）
export const GEMINI_MODELS = [
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash（統一・指示書175）",
    desc: "文章生成・画像/PDF読み取り・検索付きリサーチのすべてに使う",
  },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

// 旧: "gemini-3.6-flash"（問題発生時はこの1行を戻し、GEMINI_THINKING_CONFIG も "minimal" に戻す）
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.8-flash";

/** 画面表示用のラベル（174の生成結果などに使う） */
export const DEFAULT_GEMINI_MODEL_LABEL = "Gemini 3.8 Flash";

// content_store の id（モデル設定の保存先）
export const GEMINI_MODEL_SETTING_KEY = "gemini_model_setting";

// Gemini 3.x は思考(thinking)が既定でON。枠固定のJSON抽出（正規表現抽出＋
// maxOutputTokens固定）が途中で切れるため、思考を抑えて安定させる。
// 3.8-flash は "minimal" を受け付けない（400: Thinking level MINIMAL is not supported・2026-09-21 実測）ので
// 最小の "low" にする。小さなタスクでは思考トークン0になりうる（実測）。
// 参照: 過去の知見 env_gemini3_thinking
export const GEMINI_THINKING_CONFIG = { thinkingLevel: "low" } as const;

// 保存値が現行候補に含まれるかを判定（廃止済みモデルIDの残留対策）
export function isKnownGeminiModel(model: string): boolean {
  return GEMINI_MODELS.some((m) => m.id === model);
}

// 現在選択中のモデルを content_store から取得（未設定・失敗時はデフォルト）
// 保存値が候補外（例: 廃止済みの gemini-3.6-flash）の場合もデフォルトへフォールバックする
export async function getSelectedGeminiModel(): Promise<string> {
  try {
    const row = await serverGetContentRow(GEMINI_MODEL_SETTING_KEY);
    const model = (row?.data as { model?: string } | null)?.model;
    return model && isKnownGeminiModel(model) ? model : DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}
