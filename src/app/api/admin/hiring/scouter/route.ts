// スカウター結果API（指示書188）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET    ?user=<userId> → { results, aiEnabled, tableMissing }
//   POST   { docId, transcript } → 院長が確認・修正した転記を保存（AIの提案は /scouter/extract。保存はここだけ）
//   PATCH  { id, transcript? , points?: {strengths,hints,questions} } → 転記の修正／ポイント文章の修正
//   DELETE { id }
// 操作ログは「した」事実と区分だけ（本文・得点は残さない）。検索・絞り込みには使わない。

import { NextRequest, NextResponse } from "next/server";
import { HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, fetchHiringDoc, newHiringId, recordHiringLog } from "@/lib/hiring-docs-server";
import { deleteScouterResult, fetchScouterResult, fetchScouterResults, saveScouterResult } from "@/lib/scouter-server";
import { fetchGrowthConfig } from "@/lib/staff-growth-server";
import { normalizeScouterPoints, normalizeScouterTranscript, transcriptHasContent } from "@/lib/scouter";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  const userId = req.nextUrl.searchParams.get("user") ?? "";
  if (!userId) return NextResponse.json({ error: "user は必須です" }, { status: 400 });
  try {
    const [{ results, tableMissing }, config] = await Promise.all([fetchScouterResults(auth.admin, userId), fetchGrowthConfig(auth.admin)]);
    return NextResponse.json({ results, tableMissing, aiEnabled: config.aiDraftEnabled });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const docId = typeof body.docId === "string" ? body.docId : "";
  if (!docId) return NextResponse.json({ error: "元の資料が指定されていません" }, { status: 400 });
  const transcript = normalizeScouterTranscript(body.transcript);
  if (!transcriptHasContent(transcript)) return NextResponse.json({ error: "転記する内容がありません" }, { status: 400 });
  try {
    const doc = await fetchHiringDoc(auth.admin, docId);
    if (!doc) return NextResponse.json({ error: "元の資料が見つかりません" }, { status: 404 });
    const now = new Date().toISOString();
    const by = auth.userEmail || auth.userId;
    const result = { id: newHiringId("scout"), userId: doc.userId, docId, ...transcript, points: null, createdAt: now, updatedAt: now, updatedBy: by };
    await saveScouterResult(auth.admin, result, by);
    await recordHiringLog(auth.admin, {
      by,
      action: "検査結果を転記（院長確認後に保存）",
      target: doc.userId,
      changes: [
        { field: "受検日", before: "", after: transcript.testDate || "未設定" },
        { field: "検査名", before: "", after: transcript.testName || "未設定" },
      ],
    });
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const prev = await fetchScouterResult(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const now = new Date().toISOString();
    const by = auth.userEmail || auth.userId;
    let next = { ...prev, updatedAt: now, updatedBy: by };
    const changes: { field: string; before: string; after: string }[] = [];
    if (body.transcript && typeof body.transcript === "object") {
      const t = normalizeScouterTranscript(body.transcript);
      if (!transcriptHasContent(t)) return NextResponse.json({ error: "転記する内容がありません" }, { status: 400 });
      next = { ...next, ...t };
      changes.push({ field: "転記", before: "記載あり", after: "記載あり（修正）" });
    }
    if (body.points && typeof body.points === "object") {
      // 院長の修正。受け取り後の除外処理（normalizeScouterPoints）はAI応答と同じ
      const edited = normalizeScouterPoints({ ...(prev.points ?? { generatedAt: "", model: "" }), ...(body.points as Record<string, unknown>), editedAt: now });
      next = { ...next, points: edited };
      changes.push({ field: "ポイント整理", before: prev.points ? "記載あり" : "空", after: "記載あり（院長が修正）" });
    }
    await saveScouterResult(auth.admin, next, by);
    if (changes.length > 0) await recordHiringLog(auth.admin, { by, action: "検査結果を更新", target: prev.userId, changes });
    return NextResponse.json({ result: next });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const prev = await fetchScouterResult(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    await deleteScouterResult(auth.admin, id);
    await recordHiringLog(auth.admin, { by: auth.userEmail || auth.userId, action: "検査結果を削除", target: prev.userId, changes: [{ field: "受検日", before: prev.testDate || "未設定", after: "" }] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
