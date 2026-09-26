// スカウター結果のポイント整理（指示書188 2）— **院長のみ**
//   POST { id } → 保存済みの転記（1〜5・7・8 だけ）から「強みと活かし方／関わり方のヒント／1on1で確かめたい問い」を作り、
//   生成日・モデルとともに保存して返す（「作り直す」も同じ）。
//   6 ネガティブ・9 虚偽・コメントは入力に渡さない。応答は normalizeScouterPoints（禁止語の項目落とし・問いの形）を通す。
//   有料枠の設定（aiDraftEnabled）がOFFなら404。

import { NextRequest, NextResponse } from "next/server";
import { callGeminiParts } from "@/lib/ai-provider";
import { HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, recordHiringLog } from "@/lib/hiring-docs-server";
import { fetchScouterResult, saveScouterResult } from "@/lib/scouter-server";
import { fetchGrowthConfig } from "@/lib/staff-growth-server";
import { SCOUTER_POINTS_SYSTEM, normalizeScouterPoints, pointsHasContent, pointsInputOf } from "@/lib/scouter";

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
    const input = pointsInputOf(prev);
    if (!input.trim()) return NextResponse.json({ error: "転記された得点（1〜5・7・8）がありません" }, { status: 400 });
    const res = await callGeminiParts({ system: SCOUTER_POINTS_SYSTEM, parts: [{ text: `転記結果:\n${input}` }], maxTokens: 4096, json: true });
    if (!res.ok) return NextResponse.json({ error: "AIの整理に失敗しました" }, { status: 502 });
    const now = new Date().toISOString();
    const points = normalizeScouterPoints({ ...((parseJsonLoose(res.text) as Record<string, unknown> | null) ?? {}), generatedAt: now, model: res.model, editedAt: "" });
    if (!pointsHasContent(points)) return NextResponse.json({ error: "整理できる内容がありませんでした（もう一度お試しください）" }, { status: 502 });
    const by = auth.userEmail || auth.userId;
    const next = { ...prev, points, updatedAt: now, updatedBy: by };
    await saveScouterResult(auth.admin, next, by);
    await recordHiringLog(auth.admin, { by, action: "ポイント整理を生成", target: prev.userId, changes: [{ field: "モデル", before: "", after: res.model }] });
    return NextResponse.json({ result: next });
  } catch (e) {
    if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
