// 必須の学び（ゲート）API（指示書190 B）— **院長のみ**（authorizeGrowth + isAdmin。幹部・本人は404）
//   GET    → { gates, courses, tableMissing }
//   POST   { transition, label, kind, courseIds, perYearMin } → 登録
//   PATCH  { id, ...同上 } → 更新（講座の紐づけもここ）
//   DELETE { id }
//   PUT    { seed: true } → 確定版 第4節の必須の学びを初期登録（重複は飛ばす）
//   PUT    { check: { userId, gateId, ok, checkedOn, note } } → 資格・院長の確認（○×と確認日・根拠）
// 判定は○×のみ（割合・点数にしない）。操作ログは事実だけ。

import { NextResponse } from "next/server";
import { authorizeGrowth, fetchCourses, newGrowthId, recordGrowthLog } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { deleteGate, fetchGates, saveGate, saveGateCheck, seedGates } from "@/lib/growth-matrix-server";
import { isGateKind, isTransitionKey, normalizeGate, transitionLabel, ymdOf } from "@/lib/growth-matrix";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  try {
    const [{ gates, tableMissing }, { courses }] = await Promise.all([fetchGates(auth.admin), fetchCourses(auth.admin)]);
    return NextResponse.json({ gates, courses: courses.filter((c) => !c.hidden), tableMissing });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const now = new Date().toISOString();
  const gate = normalizeGate(newGrowthId("gate"), { ...body, createdAt: now, updatedAt: now });
  if (!gate) return NextResponse.json({ error: "移行と名前は必須です" }, { status: 400 });
  if (!isGateKind(body.kind)) return NextResponse.json({ error: "種類が不正です" }, { status: 400 });
  try {
    const by = auth.userEmail || auth.userId;
    await saveGate(auth.admin, gate, by);
    await recordGrowthLog(auth.admin, { by, action: "登録", kind: "ゲート", target: `${transitionLabel(gate.transition)} ${gate.label}`, changes: [{ field: "種類", before: "", after: gate.kind }] });
    return NextResponse.json({ gate });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!body || !id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const { gates } = await fetchGates(auth.admin);
    const prev = gates.find((g) => g.id === id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const next = normalizeGate(id, { ...prev, ...body, id, createdAt: prev.createdAt, updatedAt: new Date().toISOString() });
    if (!next) return NextResponse.json({ error: "名前は必須です" }, { status: 400 });
    const by = auth.userEmail || auth.userId;
    await saveGate(auth.admin, next, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "更新",
      kind: "ゲート",
      target: `${transitionLabel(next.transition)} ${next.label}`,
      changes: [{ field: "紐づけた講座", before: `${prev.courseIds.length}件`, after: `${next.courseIds.length}件` }],
    });
    return NextResponse.json({ gate: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const { gates } = await fetchGates(auth.admin);
    const prev = gates.find((g) => g.id === id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    await deleteGate(auth.admin, id);
    await recordGrowthLog(auth.admin, { by: auth.userEmail || auth.userId, action: "削除", kind: "ゲート", target: `${transitionLabel(prev.transition)} ${prev.label}`, changes: [] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const by = auth.userEmail || auth.userId;
  try {
    if (body.seed === true) {
      const n = await seedGates(auth.admin, by);
      await recordGrowthLog(auth.admin, { by, action: "初期登録", kind: "ゲート", target: "確定版 第4節", changes: [{ field: "件数", before: "", after: `${n}件` }] });
      return NextResponse.json({ ok: true, added: n });
    }
    const c = body.check && typeof body.check === "object" ? (body.check as Record<string, unknown>) : null;
    if (c) {
      const userId = typeof c.userId === "string" ? c.userId : "";
      const gateId = typeof c.gateId === "string" ? c.gateId : "";
      if (!userId || !gateId) return NextResponse.json({ error: "対象が不明です" }, { status: 400 });
      const { gates } = await fetchGates(auth.admin);
      const gate = gates.find((g) => g.id === gateId);
      if (!gate) return NextResponse.json({ error: "ゲートが見つかりません" }, { status: 404 });
      const ok = c.ok === true;
      const checkedOn = ymdOf(c.checkedOn);
      const note = typeof c.note === "string" ? c.note.slice(0, 500) : "";
      if (ok && (!checkedOn || !note.trim())) return NextResponse.json({ error: "○にするには確認日と根拠を記入してください" }, { status: 400 });
      const saved = await saveGateCheck(auth.admin, { userId, gateId, ok, checkedOn, note, by });
      await recordGrowthLog(auth.admin, { by, action: ok ? "確認（○）" : "確認を外す（×）", kind: "ゲート", target: `${userId}: ${gate.label}`, changes: [{ field: "確認日", before: "", after: checkedOn || "—" }] });
      return NextResponse.json({ check: saved });
    }
    if (!isTransitionKey(body.transition) && body.seed !== true) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
