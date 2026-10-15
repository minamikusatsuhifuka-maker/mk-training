// 📊 ガントチャート（指示書250）
//
//   GET                          → { categories, plans, canWrite, canEditCategories, fiscalStartMonth }
//   POST   { fields }            → 計画を足す（書く人）
//   PATCH  { id, fields }        → 計画を直す（書く人）
//   PATCH  { reorder: [{id,order}] } → 並べ替え（書く人）
//   DELETE ?id=                  → 計画を消す（中の小さな計画も一緒に・書く人）
//   PUT    { categories }        → 分類を保存（院長だけ）。消した分類の計画は「その他」へ移す
//
// 判定はすべて authorizeGantt（lib/gantt-server.ts）。書けない人には書く口がない（404と同じ応答）。
// 四象限から出した項目（id が pm: で始まる）はここでは直せない（直すのは四象限）。

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeGantt,
  deletePlans,
  loadCategories,
  loadFiscalStart,
  loadMatrixPlans,
  loadPlan,
  loadPlans,
  moveMatrixToOther,
  movePlansToOther,
  saveCategories,
  savePlan,
  visiblePlans,
} from "@/lib/gantt-server";
import {
  OTHER_CATEGORY_ID,
  genPlanId,
  normalizeCategories,
  normalizePlan,
  type GanttPlan,
  type PlanFields,
} from "@/lib/gantt";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

function readFields(body: Record<string, unknown>): PlanFields | null {
  const f = body.fields;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const o = f as Record<string, unknown>;
  const out: PlanFields = {};
  for (const k of ["name", "categoryId", "start", "end", "assignee", "status", "memo", "parentId"] as const) {
    if (k in o) (out as Record<string, unknown>)[k] = o[k];
  }
  return out;
}

/** 小さな計画は1段だけ。上の計画は、いちばん上の計画（四象限の項目は不可）。分類は上の計画と同じにそろえる */
function checkParent(next: GanttPlan, plans: GanttPlan[]): string | null {
  if (!next.parentId) return null;
  if (next.parentId === next.id) return "自分の中には入れられません";
  const parent = plans.find((p) => p.id === next.parentId);
  if (!parent || parent.parentId) return "入れる先の計画が見つかりません（中に入れられるのは1段だけです）";
  if (plans.some((p) => p.parentId === next.id)) return "中に小さな計画がある計画は、ほかの計画の中に入れられません";
  next.categoryId = parent.categoryId;
  return null;
}

export async function GET() {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) : hidden();
  try {
    const categories = await loadCategories(auth.admin);
    const [plans, matrix, fiscalStartMonth] = await Promise.all([
      loadPlans(auth.admin),
      loadMatrixPlans(auth.admin, categories),
      loadFiscalStart(),
    ]);
    return NextResponse.json(
      {
        categories,
        plans: [...visiblePlans(plans, auth.user), ...matrix],
        canWrite: auth.canWrite,
        canEditCategories: auth.canEditCategories,
        fiscalStartMonth,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.canWrite) return auth.ok ? hidden() : auth.status === 401 ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields = readFields(body);
  if (!fields) return bad("不正なリクエストです");
  try {
    const [plans, categories] = await Promise.all([loadPlans(auth.admin), loadCategories(auth.admin)]);
    const id = genPlanId();
    const next = normalizePlan(id, { ...fields, order: 0 });
    if (!next) return bad("名前と開始日を入れてください");
    if (!categories.some((c) => c.id === next.categoryId)) next.categoryId = OTHER_CATEGORY_ID;
    const problem = checkParent(next, plans);
    if (problem) return bad(problem);
    // 同じ並びのいちばん下へ
    const siblings = plans.filter((p) => (next.parentId ? p.parentId === next.parentId : !p.parentId && p.categoryId === next.categoryId));
    next.order = siblings.length ? Math.max(...siblings.map((p) => p.order)) + 1 : 0;
    if (auth.testSeed) next.testSeed = true;
    const saved = await savePlan(auth.admin, next, auth.user.email ?? auth.user.id);
    return NextResponse.json({ plan: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.canWrite) return auth.ok ? hidden() : auth.status === 401 ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const by = auth.user.email ?? auth.user.id;
  try {
    // 並べ替え
    if (Array.isArray(body.reorder)) {
      const plans = await loadPlans(auth.admin);
      const items = (body.reorder as unknown[])
        .map((v) => (v && typeof v === "object" ? (v as { id?: unknown; order?: unknown }) : {}))
        .filter((v): v is { id: string; order: number } => typeof v.id === "string" && typeof v.order === "number");
      for (const it of items.slice(0, 200)) {
        const p = plans.find((x) => x.id === it.id);
        if (p && p.order !== it.order) await savePlan(auth.admin, { ...p, order: it.order }, by);
      }
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || id.startsWith("pm:")) return bad("この計画はここでは直せません（四象限マトリクスで直してください）");
    const fields = readFields(body);
    if (!fields) return bad("不正なリクエストです");
    const prev = await loadPlan(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404, headers: NO_STORE });
    const next = normalizePlan(id, { ...prev, ...fields });
    if (!next) return bad("名前と開始日を入れてください");
    const [plans, categories] = await Promise.all([loadPlans(auth.admin), loadCategories(auth.admin)]);
    if (!categories.some((c) => c.id === next.categoryId)) next.categoryId = OTHER_CATEGORY_ID;
    const problem = checkParent(next, plans);
    if (problem) return bad(problem);
    // 上の計画の分類を変えたら、中の小さな計画もそろえる
    const saved = await savePlan(auth.admin, next, by);
    if (!next.parentId && next.categoryId !== prev.categoryId) {
      for (const c of plans.filter((p) => p.parentId === id)) await savePlan(auth.admin, { ...c, categoryId: next.categoryId }, by);
    }
    return NextResponse.json({ plan: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.canWrite) return auth.ok ? hidden() : auth.status === 401 ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) : hidden();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.startsWith("pm:")) return bad("この計画はここでは消せません（四象限マトリクスで「ガントチャートに出す」を外してください）");
  try {
    const plans = await loadPlans(auth.admin);
    if (!plans.some((p) => p.id === id)) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404, headers: NO_STORE });
    await deletePlans(auth.admin, [id, ...plans.filter((p) => p.parentId === id).map((p) => p.id)]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.canEditCategories) return auth.ok ? hidden() : auth.status === 401 ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!Array.isArray(body.categories)) return bad("不正なリクエストです");
  try {
    const prev = await loadCategories(auth.admin);
    const by = auth.user.email ?? auth.user.id;
    const next = await saveCategories(auth.admin, normalizeCategories(body.categories), by);
    const removed = prev.map((c) => c.id).filter((id) => !next.some((c) => c.id === id));
    const moved = (await movePlansToOther(auth.admin, removed, by)) + (await moveMatrixToOther(auth.admin, removed));
    return NextResponse.json({ categories: next, moved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
