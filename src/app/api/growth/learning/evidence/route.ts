// 学びの記録の証跡（受講証・メモの画像）API（指示書179 B-1）
//   POST   multipart { learningId, files[] } → 非公開バケット growth-evidence へ保存し、記録に参照を追加
//   DELETE JSON { learningId, path }        → 実体を先に削除 → 記録から参照を除去（孤児ゼロ・132-B/165と同じ）
// 本人の記録 or 管理者。画像のみ・1枚8MBまで・1記録あたり EVIDENCE_MAX_COUNT 枚。
// 閲覧は GET /api/growth/learning が返す署名URL（1時間）だけ。恒久URLは保存しない。

import { NextRequest, NextResponse } from "next/server";
import {
  GROWTH_EVIDENCE_BUCKET,
  GrowthBucketMissingError,
  attachEvidenceUrls,
  authorizeGrowth,
  ensureGrowthBucket,
  fetchLearningRow,
  recordGrowthLog,
  saveLearning,
  translateGrowthStorageError,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { EVIDENCE_MAX_BYTES, EVIDENCE_MAX_COUNT } from "@/lib/staff-growth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("不正なリクエストです");
  }
  const learningId = String(form.get("learningId") ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!learningId || files.length === 0) return badRequest("記録と画像ファイルは必須です");
  for (const f of files) {
    if (!f.type.startsWith("image/")) return badRequest("画像ファイルのみアップロードできます");
    if (f.size > EVIDENCE_MAX_BYTES) return badRequest("8MBを超える画像が含まれています");
  }

  try {
    const rec = await fetchLearningRow(auth.admin, learningId);
    if (!rec || (rec.userId !== auth.userId && !auth.isAdmin)) return hidden();
    if (rec.evidence.length + files.length > EVIDENCE_MAX_COUNT) {
      return badRequest(`証跡は1件の記録につき${EVIDENCE_MAX_COUNT}枚までです`);
    }

    await ensureGrowthBucket(auth.admin);

    const now = new Date().toISOString();
    const added: { path: string; name: string; uploadedAt: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      // パスは持ち主のID配下（誰の証跡かがパスだけで分かる・混在させない）
      const path = `${rec.userId}/${rec.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bytes = Buffer.from(await f.arrayBuffer());
      const { error } = await auth.admin.storage
        .from(GROWTH_EVIDENCE_BUCKET)
        .upload(path, bytes, { contentType: f.type, upsert: false });
      if (error) throw translateGrowthStorageError(error.message);
      added.push({ path, name: (f.name || "image").slice(0, 200), uploadedAt: now });
    }

    const next = { ...rec, evidence: [...rec.evidence, ...added], updatedAt: now };
    const by = auth.userEmail || auth.userId;
    await saveLearning(auth.admin, next, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "証跡追加",
      kind: "学びの記録",
      target: rec.userId === auth.userId ? "本人" : "管理者による追加",
      changes: [{ field: "証跡", before: `${rec.evidence.length}件`, after: `${next.evidence.length}件` }],
    });
    const signed = await attachEvidenceUrls(auth.admin, [next]);
    return NextResponse.json({ record: signed.records[0] });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  let body: { learningId?: unknown; path?: unknown };
  try {
    body = (await req.json()) as { learningId?: unknown; path?: unknown };
  } catch {
    return badRequest("不正なリクエストです");
  }
  const learningId = typeof body.learningId === "string" ? body.learningId : "";
  const path = typeof body.path === "string" ? body.path : "";
  if (!learningId || !path) return badRequest("learningId と path は必須です");

  try {
    const rec = await fetchLearningRow(auth.admin, learningId);
    if (!rec || (rec.userId !== auth.userId && !auth.isAdmin)) return hidden();
    if (!rec.evidence.some((e) => e.path === path)) {
      return NextResponse.json({ error: "対象の証跡が見つかりません" }, { status: 404 });
    }

    // 実体を先に削除（失敗時は参照を残し再試行できる）
    const { error: rmError } = await auth.admin.storage.from(GROWTH_EVIDENCE_BUCKET).remove([path]);
    if (rmError) {
      const translated = translateGrowthStorageError(rmError.message);
      if (translated instanceof GrowthBucketMissingError) throw translated;
      return NextResponse.json(
        { error: `証跡の削除に失敗しました（再試行してください）: ${rmError.message}` },
        { status: 500 }
      );
    }

    const next = {
      ...rec,
      evidence: rec.evidence.filter((e) => e.path !== path),
      updatedAt: new Date().toISOString(),
    };
    const by = auth.userEmail || auth.userId;
    await saveLearning(auth.admin, next, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "証跡削除",
      kind: "学びの記録",
      target: rec.userId === auth.userId ? "本人" : "管理者による削除",
      changes: [{ field: "証跡", before: `${rec.evidence.length}件`, after: `${next.evidence.length}件` }],
    });
    const signed = await attachEvidenceUrls(auth.admin, [next]);
    return NextResponse.json({ record: signed.records[0] });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
