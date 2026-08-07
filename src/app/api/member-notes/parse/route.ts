// メンバーノートのAI取り込み（指示書150）
//
// 絶対条件（評価的な個人情報を扱うため）:
//   - このAPIは **提案を返すだけ**。データベースには一切書き込まない（保存は院長の承認後、
//     既存の PUT /api/member-notes 経由でのみ行われる）。
//   - アップロードされたファイルは **ストレージに保存しない**。メモリ上で解析して破棄する。
//   - 149の認可（指定アカウント限定・非許可は404）の内側にのみ存在する。
//
// FACT_GUARD: 資料に書かれていないことは出させない。読み取れない項目は空文字のまま返す。

import { NextResponse } from "next/server";
import {
  getSelectedGeminiModel,
  GEMINI_THINKING_CONFIG,
} from "@/lib/gemini-models";
import { authorizeMemberNotes } from "@/lib/member-notes-server";
import { extractOfficeText } from "@/lib/library-extract";
import { fileKind } from "@/lib/library";
import { normalizeNoteDate, STRENGTHS_MAX, MEMO_MAX } from "@/lib/member-notes";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 1ファイルあたり20MB
const MAX_FILES = 10;

const hidden = () =>
  NextResponse.json({ error: "Not Found" }, { status: 404 });

export type MemberNoteProposal = {
  sourceFile: string;
  /** AIが資料から読み取った氏名（突合の手がかり。未読取は ""） */
  readName: string;
  /** 突合できたメンバーの userId。曖昧・不明は null（＝未割り当て） */
  staffUserId: string | null;
  /** 突合の確からしさ。low のときは画面で「要確認」を出す */
  confidence: "high" | "low";
  birthday: string;
  joinedOn: string;
  strengths: string;
  memo: string;
  /** 解析できなかった場合の理由（画面表示用） */
  note: string;
};

function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const s = cleaned.indexOf(open);
    const e = cleaned.lastIndexOf(close);
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(cleaned.slice(s, e + 1));
      } catch {
        /* fallthrough */
      }
    }
  }
  return null;
}

function buildPrompt(
  fileName: string,
  members: { userId: string; name: string }[]
): string {
  const roster = members
    .map((m) => `- ${m.name} (id: ${m.userId})`)
    .join("\n");
  return `あなたはクリニックの人事記録の下書きを作る補助です。アップロードされた資料を読み、下のJSONだけを返してください。

【最重要ルール（違反禁止）】
- 資料に**書かれていないことは絶対に書かない**。推測・一般論・創作をしない。
- 読み取れない項目は空文字 "" にする。埋めようとしないこと。
- 評価・格付け・点数を新たに付けない。資料にある記述をそのまま writing する。
- 資料が人物についてのものでない場合は staffName を "" にする。

【メンバー名簿（この中から突合する）】
${roster || "(名簿が空)"}

【出力JSON（この形だけを返す・前後に文章を付けない）】
{
  "staffName": "資料から読み取れた氏名。名簿と一致しない・読めない場合は空文字",
  "matchedUserId": "名簿と確実に一致したときだけ その id。少しでも曖昧なら空文字",
  "confidence": "high または low",
  "birthday": "YYYY-MM-DD（資料に誕生日の記載がある場合のみ。無ければ空文字）",
  "joinedOn": "YYYY-MM-DD（資料に入職日・入社日の記載がある場合のみ。無ければ空文字）",
  "strengths": "強み・資質・長所に関する記述を、資料の言葉のまま箇条書きで。無ければ空文字",
  "memo": "そのほか記録に残す価値のある事実の記述。無ければ空文字"
}

対象ファイル: ${fileName}`;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) return hidden();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が設定されていません" },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  let members: { userId: string; name: string }[] = [];
  try {
    const raw = JSON.parse((form.get("members") as string) || "[]");
    if (Array.isArray(raw)) {
      members = raw
        .filter(
          (m): m is { userId: string; name: string } =>
            !!m &&
            typeof m.userId === "string" &&
            typeof m.name === "string" &&
            m.userId !== ""
        )
        .slice(0, 200);
    }
  } catch {
    members = [];
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `一度に解析できるのは${MAX_FILES}件までです` },
      { status: 400 }
    );
  }

  const model = await getSelectedGeminiModel();
  const knownIds = new Set(members.map((m) => m.userId));
  const proposals: MemberNoteProposal[] = [];

  for (const file of files) {
    const name = file.name || "(名称不明)";
    const base: MemberNoteProposal = {
      sourceFile: name,
      readName: "",
      staffUserId: null,
      confidence: "low",
      birthday: "",
      joinedOn: "",
      strengths: "",
      memo: "",
      note: "",
    };

    if (file.size === 0 || file.size > MAX_BYTES) {
      proposals.push({ ...base, note: "サイズが大きすぎます（20MBまで）" });
      continue;
    }

    // ここで読み込んだ内容はメモリ上だけ。ストレージには一切書かない
    let buffer: Buffer | null = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "";
    const kind = fileKind(mime, name);
    let parts: Record<string, unknown>[];

    try {
      if (mime.startsWith("image/")) {
        parts = [
          { text: buildPrompt(name, members) },
          { inline_data: { mime_type: mime, data: buffer.toString("base64") } },
        ];
      } else if (kind === "pdf") {
        parts = [
          { text: buildPrompt(name, members) },
          {
            inline_data: {
              mime_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
        ];
      } else if (kind === "word" || kind === "ppt") {
        const extracted = await extractOfficeText(buffer, mime, name);
        if (!extracted.ok) {
          proposals.push({
            ...base,
            note: "文字を読み取れませんでした（手入力してください）",
          });
          continue;
        }
        parts = [
          {
            text:
              buildPrompt(name, members) +
              `\n\n--- 資料本文（抽出テキスト） ---\n${extracted.text.slice(0, 12000)}`,
          },
        ];
      } else {
        proposals.push({
          ...base,
          note: "対応していない形式です（画像・PDF・Wordのみ）",
        });
        continue;
      }

      const res = await fetch(
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
      if (!res.ok) {
        proposals.push({ ...base, note: "AI解析に失敗しました" });
        continue;
      }
      const data = await res.json();
      const text: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const obj = parseJsonLoose(text) as Record<string, unknown> | null;
      if (!obj) {
        proposals.push({ ...base, note: "AIの応答を読み取れませんでした" });
        continue;
      }

      // AIが返した userId は必ず名簿と突合してから採用する（勝手なIDを弾く）
      const rawId = str(obj.matchedUserId, 64);
      const matched = rawId && knownIds.has(rawId) ? rawId : null;
      proposals.push({
        sourceFile: name,
        readName: str(obj.staffName, 100),
        staffUserId: matched,
        confidence: obj.confidence === "high" && matched ? "high" : "low",
        birthday: normalizeNoteDate(obj.birthday),
        joinedOn: normalizeNoteDate(obj.joinedOn),
        strengths: str(obj.strengths, STRENGTHS_MAX),
        memo: str(obj.memo, MEMO_MAX),
        note: matched ? "" : "メンバーを特定できませんでした（手動で選んでください）",
      });
    } catch {
      proposals.push({ ...base, note: "解析中にエラーが発生しました" });
    } finally {
      // 一時データの明示的な解放（処理後に残さない）
      buffer = null;
    }
  }

  // 保存は一切していない。返すのは下書きのみ
  return NextResponse.json({ proposals, saved: false });
}
