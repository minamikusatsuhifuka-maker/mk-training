// スタッフ向けAI機能の共通呼び出しヘルパー。
// 管理トグル（content_store キー ai_provider_setting）に応じて Claude / Gemini を切替える。
// 既定は 'gemini'（gemini-3.5-flash）。保存値があればそれを優先（トグルで claude に戻せる）。
// プロンプト本文・理念注入・出力整形は各 route 側に残す。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSelectedGeminiModel,
  DEFAULT_GEMINI_MODEL,
  GEMINI_THINKING_CONFIG,
} from "./gemini-models";

// content_store の id（プロバイダ設定の保存先）
export const AI_PROVIDER_SETTING_KEY = "ai_provider_setting";

export type AiProvider = "claude" | "gemini";

// 既定は gemini（新規/未設定では Gemini 3.5-flash で動く。トグルで claude に戻せる）
export const DEFAULT_AI_PROVIDER: AiProvider = "gemini";

// Claude の既定モデル（各 route の従来モデルを尊重するため override 可能）
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5";

function serverSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// 現在のプロバイダ設定を content_store から取得（未設定・失敗時は既定 gemini）。
// 保存値がある場合はそれを優先（明示的に claude を選べば claude）。
export async function getAiProvider(): Promise<AiProvider> {
  try {
    const supabase = serverSupabase();
    if (!supabase) return DEFAULT_AI_PROVIDER;
    const { data } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", AI_PROVIDER_SETTING_KEY)
      .single();
    const provider = (data?.data as { provider?: string } | null)?.provider;
    return provider === "claude" ? "claude" : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export interface CallAIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallAIOptions {
  system?: string;
  messages: CallAIMessage[];
  maxTokens: number;
  temperature?: number;
  // JSON を期待する機能向け。Gemini 時に「JSONのみ出力」を明示する。
  // 実際のパースは呼び出し側の既存処理（3段階パース等）を流用する。
  json?: boolean;
  // Claude のモデル override（各 route の従来モデルを維持するため）。
  claudeModel?: string;
}

export interface CallAIResult {
  ok: boolean;
  text: string;
  // 失敗時の上流エラー本文（呼び出し側が従来どおり整形・フォールバックできる）
  error?: string;
  provider: AiProvider;
}

// プロバイダに応じて分岐し、統一インターフェースで { text } を返す。
// 失敗時は例外を投げず ok:false + error を返す（上位が従来どおりハンドリングできる）。
export async function callAI(opts: CallAIOptions): Promise<CallAIResult> {
  const provider = await getAiProvider();
  if (provider === "gemini") return callGemini(opts);
  return callClaude(opts);
}

async function callClaude(opts: CallAIOptions): Promise<CallAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return {
      ok: false,
      text: "",
      error: "ANTHROPIC_API_KEY が設定されていません",
      provider: "claude",
    };

  try {
    const body: Record<string, unknown> = {
      model: opts.claudeModel || DEFAULT_CLAUDE_MODEL,
      max_tokens: opts.maxTokens,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (opts.system) body.system = opts.system;
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return { ok: false, text: "", error: err, provider: "claude" };
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    return { ok: true, text, provider: "claude" };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : String(e),
      provider: "claude",
    };
  }
}

async function callGemini(opts: CallAIOptions): Promise<CallAIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return {
      ok: false,
      text: "",
      error: "GEMINI_API_KEY が設定されていません",
      provider: "gemini",
    };

  // 管理画面で選択中の Gemini モデル（3.5-flash / 3.1-pro）を使用
  const supabase = serverSupabase();
  const model = supabase
    ? await getSelectedGeminiModel(supabase)
    : DEFAULT_GEMINI_MODEL;

  // messages を Gemini の contents にマッピング（assistant → model）
  const contents = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // system は systemInstruction に。json 指定時は「JSONのみ出力」を明示。
  let systemText = (opts.system || "").trim();
  if (opts.json) {
    const jsonNote =
      "出力はJSONのみとし、マークダウンのコードフェンス（```）や前後の説明文は一切付けないこと。";
    systemText = systemText ? `${systemText}\n\n${jsonNote}` : jsonNote;
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens,
    // Gemini 3.x は思考が既定ON。枠固定JSON抽出が切れるため最小化（既存方針を踏襲）。
    thinkingConfig: GEMINI_THINKING_CONFIG,
  };
  if (typeof opts.temperature === "number")
    generationConfig.temperature = opts.temperature;

  const body: Record<string, unknown> = { contents, generationConfig };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return { ok: false, text: "", error: err, provider: "gemini" };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts as
      | Array<{ text?: string }>
      | undefined;
    const text = (parts || [])
      .map((p) => p?.text)
      .filter(Boolean)
      .join("");
    return { ok: true, text, provider: "gemini" };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : String(e),
      provider: "gemini",
    };
  }
}
