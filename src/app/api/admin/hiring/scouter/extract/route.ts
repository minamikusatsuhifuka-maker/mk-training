// スカウター結果の転記（指示書188 1）— **院長のみ**
//   POST { docId } → { transcript, model }。**保存しない**（院長が確認・修正して /api/admin/hiring/scouter に保存）
//   ・179で院長が確認した有料枠の設定（aiDraftEnabled）がONのときだけ。OFFは404
//   ・資料はメモリに読んで送り、応答を受け取ったら破棄。受検者の氏名・IDなどは型に無い＝normalizeScouterTranscript で落ちる

import { NextRequest, NextResponse } from "next/server";
import { callGeminiParts } from "@/lib/ai-provider";
import { HiringBucketMissingError, HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, downloadHiringDoc, fetchHiringDoc, recordHiringLog } from "@/lib/hiring-docs-server";
import { fetchGrowthConfig } from "@/lib/staff-growth-server";
import { SCOUTER_TRANSCRIBE_SYSTEM, normalizeScouterTranscript, transcriptHasContent } from "@/lib/scouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function parseJsonLoose(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  const cfg = await fetchGrowthConfig(auth.admin);
  if (!cfg.aiDraftEnabled) return hidden();
  let body: { docId?: unknown };
  try {
    body = (await req.json()) as { docId?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const docId = typeof body.docId === "string" ? body.docId : "";
  if (!docId) return NextResponse.json({ error: "docId は必須です" }, { status: 400 });
  try {
    const doc = await fetchHiringDoc(auth.admin, docId);
    if (!doc) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    let buffer: Buffer | null = await downloadHiringDoc(auth.admin, doc);
    const parts =
      doc.mimeType === "text/plain"
        ? [{ text: `不適性検査スカウターの結果報告書です。記載どおりに転記してください。\n\n--- 資料本文 ---\n${buffer.toString("utf8").slice(0, 20000)}` }]
        : [{ text: "不適性検査スカウターの結果報告書です。記載どおりに転記してください。" }, { inline_data: { mime_type: doc.mimeType, data: buffer.toString("base64") } }];
    const res = await callGeminiParts({ system: SCOUTER_TRANSCRIBE_SYSTEM, parts, maxTokens: 8192, json: true });
    buffer = null;
    if (!res.ok) return NextResponse.json({ error: "AIの読み取りに失敗しました。手入力してください。" }, { status: 502 });
    const obj = parseJsonLoose(res.text);
    const transcript = normalizeScouterTranscript(obj);
    await recordHiringLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "検査結果のAI転記（提案のみ・未保存）",
      target: doc.userId,
      changes: [{ field: "読み取り", before: "", after: transcriptHasContent(transcript) ? "あり" : "なし" }],
    });
    return NextResponse.json({ transcript, model: res.model, saved: false, unreadable: !obj });
  } catch (e) {
    if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    if (e instanceof HiringBucketMissingError) return NextResponse.json({ error: e.message, bucketMissing: true }, { status: 503 });
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
