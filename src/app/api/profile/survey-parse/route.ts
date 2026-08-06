// 基本的欲求サーベイのAI数値抽出（指示書58・PDF対応は60・nodejs）
// 画像またはPDF(base64・inlineData直渡し) → 5欲求代表値＋詳細15項目(desire/focus/current 0-100)のJSON下書き。
// 返却はあくまで下書き。ここでは保存しない（本人がレビュー後に /api/profile PUT で保存）。
// Gemini 3.x は PDF を inline_data(mime_type:"application/pdf") でそのまま読める（複数ページ可）。

import { NextRequest, NextResponse } from "next/server";
import {
  getSelectedGeminiModel,
  GEMINI_THINKING_CONFIG,
} from "@/lib/gemini-models";
import { getSessionUser } from "@/lib/staff-profiles-server";
import {
  NEED_LABELS,
  NEED_DETAIL_ITEMS,
  normalizeNeedsSurvey,
} from "@/lib/needs-survey";

export const runtime = "nodejs";
export const maxDuration = 60;

// JSONオブジェクトを堅牢に取り出す（コードフェンス除去→そのまま→brace matching→括弧補完）
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

  // 途中で切れたJSONの補完（文字列外の開き括弧をカウント）
  if (start >= 0) {
    const tail = cleaned.slice(start);
    let curly = 0;
    let square = 0;
    let inString = false;
    let escaped = false;
    for (const ch of tail) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === "{") curly++;
      else if (ch === "}") curly--;
      else if (ch === "[") square++;
      else if (ch === "]") square--;
    }
    let completed = tail;
    if (square > 0) completed += "]".repeat(square);
    if (curly > 0) completed += "}".repeat(curly);
    try {
      const v = JSON.parse(completed);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      /* fallthrough */
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    // 認可: 自分のプロフィール用（ログイン必須）
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

    const body = (await req.json()) as {
      base64?: string;
      mediaType?: string;
    };
    if (!body.base64) {
      return NextResponse.json({ error: "画像がありません" }, { status: 400 });
    }

    const model = await getSelectedGeminiModel();

    const detailList = NEED_DETAIL_ITEMS.map(
      (i) => `"${i.key}"（${i.label}／${NEED_LABELS[i.need]}）`
    ).join("、");

    const prompt = `あなたは日本のクリニックの業務アシスタントです。
添付ファイル（画像またはPDF。PDFは全ページ）は、選択理論の「5つの基本的欲求サーベイ」の結果票です。内容から数値を読み取り、次のJSONオブジェクトのみを返してください。

{
  "values": { "survival": 0-100 or null, "belonging": ..., "power": ..., "freedom": ..., "fun": ... },
  "details": { "<itemKey>": { "desire": 0-100 or null, "focus": 0-100 or null, "current": 0-100 or null }, ... }
}

- values は5欲求の代表値: survival（生存）/ belonging（愛・所属）/ power（力）/ freedom（自由）/ fun（楽しみ）。画像に代表値が無ければ、その欲求内の項目の「欲求」値の平均を入れる。それも読めなければ null。
- details の itemKey は次の15項目: ${detailList}。
- 各項目には「欲求（本来の欲求の高さ）」=desire、「注力（時間・エネルギー）」=focus、「現況（満たされ度）」=current の3値がある。読み取れない値は null。
- 数値はすべて0〜100の整数。%表記やスケール（0-5等）の場合は0-100に換算する。
- 出力はJSONオブジェクトのみ。前後の文章・説明・コードフェンス(\`\`\`)を付けない。JSONは必ず完結させる。`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: body.mediaType || "image/jpeg",
                    data: body.base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            thinkingConfig: GEMINI_THINKING_CONFIG,
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: `Gemini error: ${response.status}`, detail },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const obj = parseJsonObjectLoose(text);

    // 失敗時は空で返す（UIで手入力に誘導）
    if (!obj) {
      return NextResponse.json({ values: {}, details: {}, model });
    }

    // 0-100クランプ・不正キー除去（5欲求キー/15項目のみ通す）
    const normalized = normalizeNeedsSurvey(obj);
    return NextResponse.json({
      values: normalized.values,
      details: normalized.details,
      model,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, values: {}, details: {} },
      { status: 500 }
    );
  }
}
