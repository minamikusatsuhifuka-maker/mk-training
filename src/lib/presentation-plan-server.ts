// 発表の構成案の保存と生成（指示書174・サーバー専用）
//
// 保存先は173と同じテーブル clinic_director_retrospective（RLS全拒否・service-role のみ）。
// record_type = 'presentation_plan'、id は固定の1行（直近の生成結果だけを保持。174-1 STEP 4）。
// 173の fetchAllRecords は RECORD_KINDS 以外の行を読み飛ばすので、期の一覧などには混ざらない。
//
// AIは既存の基盤（lib/ai-provider.ts の callAI＝管理トグルの Claude/Gemini・既存キー）を使う。
// **新しいキー・環境変数は使わない**（174-5・歯止め）。

import {
  RETRO_TABLE,
  RetrospectiveTableMissingError,
  isMissingTable,
  type RetroAdminClient,
} from "./director-retrospective-server";
import { callAI, getAiProvider } from "./ai-provider";
import { getSelectedGeminiModel } from "./gemini-models";
import {
  PLAN_SYSTEM_PROMPT,
  buildPlanUserPrompt,
  normalizePresentationPlanSaved,
  parsePlanResult,
  optionsStructurallyDifferent,
  type PlanConditions,
  type PlanResult,
  type PresentationPlanSaved,
} from "./presentation-plan";

export const PRESENTATION_PLAN_TYPE = "presentation_plan";
export const PRESENTATION_PLAN_ID = "presentation_plan:latest";

export async function loadPresentationPlan(
  admin: RetroAdminClient
): Promise<{ saved: PresentationPlanSaved | null; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(RETRO_TABLE)
    .select("data")
    .eq("id", PRESENTATION_PLAN_ID)
    .eq("record_type", PRESENTATION_PLAN_TYPE)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return { saved: null, tableMissing: true };
    throw new Error(error.message);
  }
  return { saved: data ? normalizePresentationPlanSaved(data.data) : null, tableMissing: false };
}

export async function savePresentationPlan(
  admin: RetroAdminClient,
  saved: PresentationPlanSaved,
  updatedBy: string
): Promise<void> {
  const { error } = await admin.from(RETRO_TABLE).upsert({
    id: PRESENTATION_PLAN_ID,
    record_type: PRESENTATION_PLAN_TYPE,
    data: saved,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error.message)) throw new RetrospectiveTableMissingError();
    throw new Error(error.message);
  }
}

export type GenerateOutcome =
  | { ok: true; result: PlanResult; provider: string; model: string }
  | { ok: false; kind: "ai" | "parse" | "same"; message: string; provider: string; model: string };

/** 使ったモデル名（報告・保存用）。Claude は callAI の既定モデルと同じ表記にする */
async function currentModelLabel(): Promise<{ provider: string; model: string }> {
  const provider = await getAiProvider();
  if (provider === "gemini") return { provider, model: await getSelectedGeminiModel() };
  return { provider, model: "claude-sonnet-4-5" };
}

/**
 * 構成案2案＋推奨を生成する。素材は**匿名化済み**の文字列を受け取る（呼び出し側で置換する）。
 * 2案の構造が同じと機械判定できたときは1回だけ作り直しを試みる。
 */
export async function generatePlan(
  conditions: PlanConditions,
  material: string
): Promise<GenerateOutcome> {
  const { provider, model } = await currentModelLabel();
  const userPrompt = buildPlanUserPrompt(conditions, material);

  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callAI({
      system: PLAN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            attempt === 0
              ? userPrompt
              : `${userPrompt}\n\n※前回の2案は構造が同じでした。**構造の型を必ず変えて**（例: 時系列ストーリー型 と 結論先出し・比較型）作り直してください。`,
        },
      ],
      maxTokens: 8192,
      json: true,
    });
    if (!res.ok) {
      return {
        ok: false,
        kind: "ai",
        message: `AIの呼び出しに失敗しました（${res.provider}）`,
        provider,
        model,
      };
    }
    lastText = res.text;
    const parsed = parsePlanResult(res.text);
    if (!parsed) {
      return {
        ok: false,
        kind: "parse",
        message: "構成案を読み取れませんでした。「作り直す」でもう一度お試しください。",
        provider,
        model,
      };
    }
    if (optionsStructurallyDifferent(parsed.options[0], parsed.options[1])) {
      return { ok: true, result: parsed, provider, model };
    }
  }
  // 2回とも同じ構造 → 読み取れてはいるので、その旨を伝えて作り直しを促す
  const parsed = parsePlanResult(lastText);
  if (parsed) {
    return {
      ok: false,
      kind: "same",
      message: "2案の構造が同じになりました。「作り直す」でもう一度お試しください。",
      provider,
      model,
    };
  }
  return {
    ok: false,
    kind: "parse",
    message: "構成案を読み取れませんでした。「作り直す」でもう一度お試しください。",
    provider,
    model,
  };
}
