// 資料庫のAI自動分類（登録フロー・下書き提案・指示書86）
// ファイルを受け取り、テキスト抽出 → Gemini 3.6 Flash に タイトル案・カテゴリ(5択)・
// キーワード5〜10・1行要約 をJSONで提案させる。返却はあくまで下書き（保存しない）。
// - PDF: inline_data でそのまま Gemini に読ませる（survey-parse と同じ思想）。
// - Word/PPT: サーバー側で jszip 抽出 → 抽出テキストを Gemini へ。
// - 抽出不能・破損・その他形式: fallback:true を返す（UIで手入力に誘導。登録は止めない）。

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getSelectedGeminiModel,
  GEMINI_THINKING_CONFIG,
} from "@/lib/gemini-models";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { extractOfficeText } from "@/lib/library-extract";
import {
  LIBRARY_CATEGORIES,
  normalizeCategory,
  normalizeKeywords,
  fileKind,
  type LibrarySuggestion,
} from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB（指示書86: 上限未定義時は20MB）
const SEARCH_TEXT_LIMIT = 2000;

function parseJsonObjectLoose(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const v = JSON.parse(cleaned);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {
    /* fallthrough */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(cleaned.slice(start, end + 1));
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

function buildPrompt(fileName: string, bodyHint: string): string {
  return `あなたは日本のクリニックの業務アシスタントです。
添付は院内の説明資料・同意書などのドキュメント（${bodyHint}）です。ファイル名は「${fileName}」。
内容を読み、次のJSONオブジェクトのみを返してください。

{
  "title": "資料の内容が分かる簡潔な日本語タイトル",
  "category": "5択のいずれか1つ",
  "keywords": ["検索に役立つ語", "..."],
  "summary": "内容を1行で表す日本語要約（40〜80字程度）"
}

- category は次の5つから最も適切な1つを厳密に選ぶ: ${LIBRARY_CATEGORIES.join(" / ")}。迷う場合は「その他」。
- keywords は5〜10個。診療科目・施術名・検査名・書類種別など、スタッフが探す時に打ちそうな語。
- title は資料名がファイルから読めればそれを尊重し、簡潔に整える。
- 出力はJSONオブジェクトのみ。前後の文章・説明・コードフェンス(\`\`\`)を付けない。JSONは必ず完結させる。`;
}

function fallbackResponse(searchText = ""): NextResponse {
  const body: LibrarySuggestion = {
    title: "",
    category: "その他",
    keywords: [],
    summary: "",
    searchText: searchText.slice(0, SEARCH_TEXT_LIMIT),
    fallback: true,
  };
  return NextResponse.json(body);
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "ファイルサイズが不正です（20MBまで）" },
        { status: 400 }
      );
    }

    const fileName = (form.get("fileName") as string) || "";
    const mimeType = file.type || "";
    const kind = fileKind(mimeType, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const model = await getSelectedGeminiModel(supabase);

    let parts: Record<string, unknown>[];
    let searchText = "";

    if (kind === "pdf") {
      const base64 = buffer.toString("base64");
      parts = [
        { text: buildPrompt(fileName, "PDF・全ページ") },
        { inline_data: { mime_type: "application/pdf", data: base64 } },
      ];
    } else if (kind === "word" || kind === "ppt") {
      const extracted = await extractOfficeText(buffer, mimeType, fileName);
      if (!extracted.ok) {
        // 抽出不能 → 手入力フォールバック（登録は止めない）
        return fallbackResponse();
      }
      searchText = extracted.text;
      parts = [
        {
          text:
            buildPrompt(fileName, kind === "word" ? "Word文書" : "PowerPoint") +
            `\n\n--- 資料本文（抽出テキスト・先頭のみ） ---\n${extracted.text.slice(0, 12000)}`,
        },
      ];
    } else {
      // Excel・その他・旧形式 → AI提案なしの手入力フォールバック
      return fallbackResponse();
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 4096,
            thinkingConfig: GEMINI_THINKING_CONFIG,
          },
        }),
      }
    );

    if (!response.ok) {
      // AI失敗でも登録は続行できるよう、抽出テキストだけ返して手入力に誘導
      return fallbackResponse(searchText);
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const obj = parseJsonObjectLoose(text);
    if (!obj) {
      return fallbackResponse(searchText);
    }

    const suggestion: LibrarySuggestion = {
      title: typeof obj.title === "string" ? obj.title.trim() : "",
      category: normalizeCategory(obj.category),
      keywords: normalizeKeywords(obj.keywords),
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      searchText: searchText.slice(0, SEARCH_TEXT_LIMIT),
      fallback: false,
    };
    return NextResponse.json(suggestion);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
