// 採用資料のAI整理（指示書184 3）— **院長のみ**
//   POST { id（資料id）} → { proposal（項目ごとの値＋根拠）, current（今の登録値）, model }
//
// 【絶対条件】
//   ・提案を返すだけ。DB にも Storage にも書かない（150・177と同じ）。反映は /api/admin/hiring/apply で院長が選んだ分だけ
//   ・179で院長が確認した有料枠の設定（growth config の aiDraftEnabled）がONのときだけ動く。OFFは 404
//   ・資料はメモリに読んで Gemini（175の基盤）に送り、応答を受け取ったら破棄する。送った内容は保存しない
//   ・取り出さない項目（3-3）はシステムプロンプトで禁じ、応答の受け取り（normalizeHiringProposal＝ホワイトリスト＋禁止語の行落とし）でも落とす
//   ・適性検査（kind === "aptitude"）は氏名と受検日だけ（3-4）

import { NextRequest, NextResponse } from "next/server";
import { callGeminiParts } from "@/lib/ai-provider";
import {
  HiringBucketMissingError,
  HiringTableMissingError,
  ServiceRoleMissingError,
  authorizeHiring,
  downloadHiringDoc,
  fetchHiringDoc,
  fetchHiringProfile,
  recordHiringLog,
} from "@/lib/hiring-docs-server";
import { fetchGrowthConfig } from "@/lib/staff-growth-server";
import { authorizeStaffContacts, fetchAllStaffContacts } from "@/lib/staff-contacts-server";
import { emptyStaffContact } from "@/lib/staff-contacts";
import {
  HIRING_EXTRACT_SYSTEM,
  hiringDocKindLabel,
  normalizeHiringProposal,
  proposalHasContent,
} from "@/lib/hiring-docs";

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
  // 184 3-5: 有料枠の設定がOFFなら実行できない（存在も伏せる）
  const cfg = await fetchGrowthConfig(auth.admin);
  if (!cfg.aiDraftEnabled) return hidden();

  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

  try {
    const doc = await fetchHiringDoc(auth.admin, id);
    if (!doc) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });

    // 資料はメモリ上だけ。応答を受け取ったら破棄する
    let buffer: Buffer | null = await downloadHiringDoc(auth.admin, doc);
    const lead =
      `資料の種類: ${hiringDocKindLabel(doc.kind)}。` +
      (doc.kind === "aptitude"
        ? "これは適性検査の結果です。内容は要約・解釈・転記せず、受検者の氏名と受検日（testDate）だけを返してください。"
        : doc.kind === "interview"
          ? "これは面接の記録で、本人の発言と面接官（院長）の所感が混ざっています。**本人が述べた事実だけ**（連絡先・経歴・志望動機・自己PRなど）を取り出し、面接官の所感・評価・印象・判断は一切出力しないでください。"
          : "この資料から基本情報だけをJSONで返してください。");
    // 187 B: 文章（.txt）はテキストとして渡す。画像・PDFは inline_data
    const parts =
      doc.mimeType === "text/plain"
        ? [{ text: `${lead}\n\n--- 資料本文 ---\n${buffer.toString("utf8").slice(0, 20000)}` }]
        : [{ text: lead }, { inline_data: { mime_type: doc.mimeType, data: buffer.toString("base64") } }];
    const res = await callGeminiParts({ system: HIRING_EXTRACT_SYSTEM, parts, maxTokens: 4096, json: true });
    buffer = null;

    if (!res.ok) {
      return NextResponse.json({ error: "AIの読み取りに失敗しました。手入力してください。" }, { status: 502 });
    }
    const obj = parseJsonLoose(res.text);
    // ホワイトリスト＋禁止語の行落とし（3-3）／適性検査は氏名・受検日だけ（3-4）
    const proposal = normalizeHiringProposal(obj, doc.kind);
    if (!obj) proposal.notes.push("AIの応答を読み取れませんでした。手入力してください。");

    // 現在の登録値（並べて表示するため）。連絡先は169の認可をそのまま呼ぶ
    let contact = emptyStaffContact();
    try {
      const ca = await authorizeStaffContacts();
      if (ca.ok) {
        const { contacts } = await fetchAllStaffContacts(ca.admin);
        contact = contacts.find((c) => c.userId === doc.userId) ?? emptyStaffContact();
      }
    } catch {
      /* 無しで続ける */
    }
    const profile = await fetchHiringProfile(auth.admin, doc.userId);

    // 記録するのは「実行した」事実と件数だけ（抽出内容は残さない）
    await recordHiringLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "AI整理",
      target: doc.userId,
      changes: [
        { field: "資料", before: "", after: hiringDocKindLabel(doc.kind) },
        { field: "提案の有無", before: "", after: proposalHasContent(proposal) ? "あり" : "なし" },
      ],
    });

    return NextResponse.json({ proposal, current: { contact, profile }, model: res.model, saved: false });
  } catch (e) {
    if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    if (e instanceof HiringBucketMissingError) return NextResponse.json({ error: e.message, bucketMissing: true }, { status: 503 });
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
