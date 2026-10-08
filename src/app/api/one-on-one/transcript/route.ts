// 1on1の書き起こしを1回だけAIに渡し、まとめと記録欄の下書きを返す（指示書221）
//
//   POST multipart/form-data { userId, heldOn, mode, text? , file? }
//     → { summary, draft, flagged, used, limit }
//
// 【保存しない（221 §5）】ここは**提案を返すだけ**。書き起こしの原文も、作った下書きも、
//   データベース・ストレージ・サーバーのログに一切書かない。保存は利用者が確かめたうえで
//   既存の 1on1ノートの保存口（/api/private-store・content_type "one_on_one"）を通す。
//   ログに出すのは **文字数・処理時間・結果だけ**（本文は出さない）。
//
// 【使える人（221 §0-4・§1・§4）】院長、または担当スタッフの1on1を記録する幹部。
//   スタッフごとの同意の印が無ければ取り込めない。判定は one-on-one-transcript-server（サーバー側）。
//
// 【AI】モデルは gemini-models.ts の定数（175で gemini-3.8-flash）。callGeminiRaw を使い、
//   失敗しても別のモデルに切り替えない（221 §6）。PDFはそのままAIに読ませる（抽出で二度送らない）。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { callGeminiRaw, type GeminiPart } from "@/lib/ai-provider";
import { extractOfficeText } from "@/lib/library-extract";
import { jstTodayYmd } from "@/lib/library";
import {
  TRANSCRIPT_FILE_MAX_BYTES,
  TRANSCRIPT_MAX_CHARS,
  TRANSCRIPT_SYSTEM_PROMPT,
  parseTranscriptJson,
  transcriptUserPrompt,
} from "@/lib/one-on-one-transcript";
import {
  canImportTranscript,
  takeTranscriptQuota,
} from "@/lib/one-on-one-transcript-server";
import { isTestSeedUser } from "@/lib/test-seed";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

export async function POST(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("取り込む内容を読み取れませんでした");
  }
  const userId = String(form.get("userId") ?? "").trim();
  const heldOn = String(form.get("heldOn") ?? "").trim();
  const mode = String(form.get("mode") ?? "rwdepc") === "quick" ? "quick" : "rwdepc";
  const pasted = String(form.get("text") ?? "");
  const file = form.get("file");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return bad("実施日を選んでください");

  const admin = createSupabaseAdminClient();
  const permission = await canImportTranscript(admin, user, userId);
  if (!permission.ok) {
    // 機能OFF・権限なしは「存在しない」と同じ応答。同意が無いときだけ理由を伝える（院長が印を付けられるように）
    if (permission.reason === "no_consent") {
      return NextResponse.json(
        { error: "このスタッフの「1on1の録音・書き起こし：同意あり」の印がありません。" },
        { status: 403 }
      );
    }
    return hidden();
  }

  // ── 材料を1つに決める（原文はこの関数の中だけで扱い、どこにも書かない） ──
  const parts: GeminiPart[] = [];
  let charCount = 0;
  if (file instanceof File && file.size > 0) {
    if (file.size > TRANSCRIPT_FILE_MAX_BYTES) return bad("ファイルが大きすぎます（10MBまで）");
    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    if (name.endsWith(".pdf")) {
      // PDFはAIがそのまま読める。テキストに起こしてから送ると二度送ることになる
      parts.push({ inline_data: { mime_type: "application/pdf", data: buf.toString("base64") } });
      charCount = file.size;
    } else if (name.endsWith(".docx")) {
      const res = await extractOfficeText(buf, file.type || "", file.name);
      if (!res.ok || !res.text.trim()) return bad("この文書からは文字を読み取れませんでした");
      const text = res.text.slice(0, TRANSCRIPT_MAX_CHARS);
      charCount = text.length;
      parts.push({ text: transcriptUserPrompt(mode) + text });
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      const text = buf.toString("utf8").slice(0, TRANSCRIPT_MAX_CHARS);
      if (!text.trim()) return bad("ファイルが空です");
      charCount = text.length;
      parts.push({ text: transcriptUserPrompt(mode) + text });
    } else {
      return bad("取り込めるのは .txt / .md / .docx / .pdf です");
    }
  } else {
    const text = pasted.slice(0, TRANSCRIPT_MAX_CHARS);
    if (!text.trim()) return bad("書き起こしを貼り付けるか、ファイルを選んでください");
    charCount = text.length;
    parts.push({ text: transcriptUserPrompt(mode) + text });
  }
  if (parts.length === 1 && "inline_data" in parts[0]) {
    parts.push({ text: transcriptUserPrompt(mode) + "（上のPDFが書き起こしです）" });
  }

  // 1人あたり1日の回数（221 §6）
  const quota = await takeTranscriptQuota(admin, user.id, jstTodayYmd());
  if (!quota.ok) {
    return NextResponse.json(
      { error: `今日の取り込みは上限（${quota.limit}回）に達しました。明日またお試しください。` },
      { status: 429 }
    );
  }

  const started = Date.now();
  const res = await callGeminiRaw({
    contents: [{ role: "user", parts }],
    system: TRANSCRIPT_SYSTEM_PROMPT,
    maxTokens: 4000,
  });
  const ms = Date.now() - started;

  if (!res.ok) {
    // 221 §6: ほかのモデルに自動で切り替えない。失敗は失敗として返す
    console.log(`[transcript] ng chars=${charCount} ms=${ms} model=${res.model}`);
    return NextResponse.json(
      { error: "AIの整理に失敗しました。少し時間をおいて、もう一度お試しください。" },
      { status: 502 }
    );
  }
  const parsed = parseTranscriptJson(res.text, mode);
  if (!parsed) {
    console.log(`[transcript] parse_ng chars=${charCount} ms=${ms} model=${res.model}`);
    return NextResponse.json(
      { error: "AIの返事を読み取れませんでした。もう一度お試しください。" },
      { status: 502 }
    );
  }
  // ログは文字数・時間・結果だけ（本文は残さない・221 §5）
  console.log(
    `[transcript] ok chars=${charCount} ms=${ms} model=${res.model} flagged=${parsed.flagged} quotes=${parsed.summary.quotes.length}`
  );

  // 221 §7: 相手が検証用アカウントなら、保存する記録に一括削除の印を付けてもらう
  let testSeed = false;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    testSeed = isTestSeedUser(data?.user ?? null);
  } catch {
    testSeed = false;
  }

  return NextResponse.json({
    testSeed,
    summary: { ...parsed.summary, at: new Date().toISOString() },
    draft: parsed.draft,
    flagged: parsed.flagged,
    used: quota.used,
    limit: quota.limit,
    model: res.model,
  });
}
