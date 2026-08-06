import { NextRequest, NextResponse } from "next/server";
import { getSelectedGeminiModel, GEMINI_THINKING_CONFIG } from "@/lib/gemini-models";
import { normalizeParsedTask, type ParsedTask } from "@/lib/staff-tasks";

// edge は使わない（GEMINI_API_KEY を使う Node 実行）
export const runtime = "nodejs";
export const maxDuration = 60;

type InItem = {
  name?: string;
  kind?: "text" | "image";
  text?: string;
  base64?: string;
  mediaType?: string;
};

// Gemini の parts
type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

// JSON配列を堅牢に取り出す（3段階フォールバック→失敗時 []）
function parseJsonArrayLoose(raw: string): unknown[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  // 1) そのまま
  try {
    const v = JSON.parse(cleaned);
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray((v as { tasks?: unknown[] }).tasks))
      return (v as { tasks: unknown[] }).tasks;
  } catch {
    /* fallthrough */
  }

  // 2) bracket matching（最初の [ 〜 最後の ]）
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(v)) return v;
    } catch {
      /* fallthrough */
    }
  }

  // 3) 開き括弧カウントで不足分の ] / } を補完
  if (start >= 0) {
    const tail = cleaned.slice(start);
    let square = 0;
    let curly = 0;
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
      if (ch === "[") square++;
      else if (ch === "]") square--;
      else if (ch === "{") curly++;
      else if (ch === "}") curly--;
    }
    let completed = tail;
    if (curly > 0) completed += "}".repeat(curly);
    if (square > 0) completed += "]".repeat(square);
    try {
      const v = JSON.parse(completed);
      if (Array.isArray(v)) return v;
    } catch {
      /* fallthrough */
    }
  }

  return [];
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured", tasks: [] },
        { status: 500 }
      );

    const body = (await req.json()) as {
      items?: InItem[];
      members?: string[];
      categories?: string[];
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const members = Array.isArray(body.members) ? body.members : [];
    const categories = Array.isArray(body.categories)
      ? body.categories.filter((c): c is string => typeof c === "string" && !!c)
      : [];

    if (items.length === 0)
      return NextResponse.json({ tasks: [] });

    // 選択中の Gemini モデル
    const model = await getSelectedGeminiModel();

    // 今日（Asia/Tokyo）
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tokyo",
    });

    const memberHint =
      members.length > 0
        ? `既知の担当者候補（氏名表記はできるだけこの中の表記に合わせる）: ${members.join("、")}`
        : "既知の担当者候補は未登録。";

    const categoryHint =
      categories.length > 0
        ? `カテゴリ候補（この中から推定できれば入れる。判断できなければ空文字）: ${categories.join("、")}`
        : "カテゴリ候補は未登録（category は常に空文字でよい）。";

    // テキスト系をまとめる
    const textBlocks = items
      .filter((it) => it.kind !== "image" && it.text)
      .map((it, i) => `【ファイル${i + 1}: ${it.name ?? ""}】\n${it.text}`)
      .join("\n\n");

    const prompt = `あなたは日本のクリニックの業務アシスタントです。
アップロードされた内容（表・テキスト・画像/スクリーンショット/手書きメモ）から、クリニックの業務タスクを抽出してください。
今日の日付（Asia/Tokyo）: ${today}
${memberHint}
${categoryHint}

各タスクを次のJSONオブジェクトで表し、JSON配列のみを返してください:
{"title": "簡潔な内容", "assignees": ["担当者氏名", ...], "category": "カテゴリ（候補から推定・不明なら空文字）", "due": "YYYY-MM-DD または null", "status": "todo|doing|done", "note": "補足（なければ空文字）"}

ルール:
- due は ISO日付(YYYY-MM-DD) または null。「明日」「今週中」「来週月曜」等の相対表現は今日(${today})を基準に解決する。期限が読み取れなければ null。
- status は 'todo'|'doing'|'done' のいずれか。既定は 'todo'。完了済みと読めるものは 'done'。
- assignees は担当者氏名の配列。担当が複数ならすべて入れる（「山本・佐藤」「田中,鈴木」のような連名は分割して配列に）。不明なら空配列 []。既知の担当者候補に近い表記があればそれに合わせる。
- category はカテゴリ候補の中から推定できれば入れる。判断できなければ空文字。
- title は簡潔に。補足は note に入れる。
- タスクが読み取れない場合は空配列 [] を返す。
- 出力は JSON配列のみ。前後の文章・説明・コードフェンス(\`\`\`)を付けない。JSONは必ず完結させる。

${textBlocks ? `--- テキスト内容 ---\n${textBlocks}` : ""}`;

    const parts: GeminiPart[] = [{ text: prompt }];

    // 画像を inline_data として添付
    for (const it of items) {
      if (it.kind === "image" && it.base64) {
        parts.push({
          inline_data: {
            mime_type: it.mediaType || "image/png",
            data: it.base64,
          },
        });
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
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
        { error: `Gemini error: ${response.status}`, detail, tasks: [] },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const rawArr = parseJsonArrayLoose(text);
    const tasks: ParsedTask[] = rawArr
      .map(normalizeParsedTask)
      .filter((t): t is ParsedTask => t !== null);

    return NextResponse.json({ tasks, model });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // アプリを落とさない: 失敗でも tasks:[] を返す
    return NextResponse.json({ error: message, tasks: [] }, { status: 500 });
  }
}
