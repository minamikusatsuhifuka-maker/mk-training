// 📜 当院の歩み（指示書253）
//
//   GET                          → { intro, entries, voices, categories, canWrite, canEditIntro, me, people, candidates }
//   POST   { fields }            → 出来事を足す（書く人）
//   POST   { fromPlanId }        → ガントチャートの計画から写して足す（書く人）。写したあとは別に残る
//   POST   { op:"dismiss"|"undismiss", planId } → 候補から外す／戻す（書く人）
//   PATCH  { id, fields }        → 直す（書く人）
//   DELETE ?id=                  → 消す（声と写真も一緒に・書く人）
//   PUT    { intro }             → 入口の文を直す（院長だけ）
//
// 判定はすべて authorizeAyumi（lib/ayumi-server.ts）。書けない人には書く口がない（404と同じ応答）。

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeAyumi,
  deleteEntryCascade,
  loadDismissed,
  loadEntries,
  loadEntry,
  loadIntro,
  loadVoices,
  peopleCandidates,
  pickPeople,
  saveDismissed,
  saveEntry,
  saveIntro,
  visibleEntries,
  visibleVoices,
  withPhotoUrls,
} from "@/lib/ayumi-server";
import { loadCategories, loadMatrixPlans, loadPlans, visiblePlans } from "@/lib/gantt-server";
import {
  ENTRY_FIELD_KEYS,
  fromGanttDate,
  ganttCandidates,
  genEntryId,
  normalizeEntry,
  normalizeIntro,
  type AyumiEntry,
  type EntryFields,
} from "@/lib/ayumi";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

function readFields(body: Record<string, unknown>): EntryFields | null {
  const f = body.fields;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const o = f as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ENTRY_FIELD_KEYS) if (k in o) out[k] = o[k];
  return out as EntryFields;
}

/** ガントチャートの計画（院の計画・チームプロジェクト・四象限から出したもの） */
async function ganttPlansFor(auth: Exclude<Awaited<ReturnType<typeof authorizeAyumi>>, { ok: false }>) {
  const categories = await loadCategories(auth.admin);
  const [plans, matrix] = await Promise.all([loadPlans(auth.admin), loadMatrixPlans(auth.admin, categories)]);
  return { categories, plans: [...visiblePlans(plans, auth.user), ...matrix] };
}

export async function GET() {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  try {
    const [intro, entriesAll, voicesAll, gantt] = await Promise.all([
      loadIntro(auth.admin),
      loadEntries(auth.admin),
      loadVoices(auth.admin),
      ganttPlansFor(auth),
    ]);
    const entries = await withPhotoUrls(auth.admin, visibleEntries(entriesAll, auth.user));
    const ids = new Set(entries.map((e) => e.id));
    const voices = visibleVoices(voicesAll, auth.user).filter((v) => ids.has(v.entryId));
    let candidates: unknown[] = [];
    let people: { id: string; name: string }[] = [];
    if (auth.canWrite) {
      const dismissed = await loadDismissed(auth.admin);
      const kept = new Set(entriesAll.map((e) => e.source?.planId).filter((x): x is string => !!x));
      candidates = ganttCandidates(gantt.plans, kept, dismissed, jstTodayYmd()).map((p) => ({
        id: p.id,
        name: p.name,
        start: p.start,
        end: p.end,
        status: p.status,
        categoryId: p.categoryId,
        kind: p.kind ?? (p.source === "matrix" ? "matrix" : "plan"),
      }));
      people = await peopleCandidates(auth.admin, auth.testSeed).catch(() => []);
    }
    // 院長には【P.30】をそのまま返す。ほかの人には、書き足されていれば返す（空ならそもそも出さない）
    return NextResponse.json(
      {
        intro,
        entries,
        voices,
        categories: gantt.categories,
        canWrite: auth.canWrite,
        canEditIntro: auth.canEditIntro,
        me: auth.user.id,
        people,
        candidates,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (!auth.canWrite) return hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const by = auth.user.email ?? auth.user.id;
  try {
    // 候補から外す／戻す
    if (body.op === "dismiss" || body.op === "undismiss") {
      const planId = typeof body.planId === "string" ? body.planId.slice(0, 80) : "";
      if (!planId) return bad("不正なリクエストです");
      const set = await loadDismissed(auth.admin);
      if (body.op === "dismiss") set.add(planId);
      else set.delete(planId);
      await saveDismissed(auth.admin, set, by);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const now = new Date().toISOString();
    const base = { createdBy: auth.user.id, createdAt: now, updatedAt: now, ...(auth.testSeed ? { testSeed: true } : {}) };
    const candidates = await peopleCandidates(auth.admin, auth.testSeed);
    // ガントチャートから写す（題名・期間・分類／チームプロジェクトはチーム名・メンバー）
    if (typeof body.fromPlanId === "string") {
      const { plans } = await ganttPlansFor(auth);
      const p = plans.find((x) => x.id === body.fromPlanId);
      if (!p) return NextResponse.json({ error: "年間計画の計画が見つかりません" }, { status: 404, headers: NO_STORE });
      const all = await loadEntries(auth.admin);
      const already = all.find((e) => e.source?.planId === p.id);
      if (already) return NextResponse.json({ entry: already, already: true }, { headers: NO_STORE });
      const team = p.kind === "team";
      const entry = normalizeEntry(genEntryId(), {
        ...base,
        title: p.name,
        dateFrom: fromGanttDate(p.start),
        dateTo: fromGanttDate(p.end),
        categoryId: p.categoryId,
        teamName: team ? p.name : "",
        people: team ? pickPeople(p.members, candidates, p.members ?? []) : [],
        source: { kind: "gantt", planId: p.id },
      });
      if (!entry) return bad("写せませんでした（題名と日付が要ります）");
      const saved = await saveEntry(auth.admin, entry, by);
      return NextResponse.json({ entry: saved }, { headers: NO_STORE });
    }
    const fields = readFields(body);
    if (!fields) return bad("不正なリクエストです");
    const entry = normalizeEntry(genEntryId(), { ...fields, ...base, people: pickPeople(fields.people, candidates) });
    if (!entry) return bad("題名と日付を入れてください");
    const saved = await saveEntry(auth.admin, entry, by);
    return NextResponse.json({ entry: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (!auth.canWrite) return hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  const fields = readFields(body);
  if (!id || !fields) return bad("不正なリクエストです");
  try {
    const prev = await loadEntry(auth.admin, id);
    if (!prev || visibleEntries([prev], auth.user).length === 0) return hidden();
    const candidates = "people" in fields ? await peopleCandidates(auth.admin, prev.testSeed === true) : [];
    const next = normalizeEntry(id, {
      ...prev,
      ...fields,
      people: "people" in fields ? pickPeople(fields.people, candidates, prev.people) : prev.people,
      // 変えない項目
      photos: prev.photos,
      source: prev.source,
      testSeed: prev.testSeed,
      createdBy: prev.createdBy,
      createdAt: prev.createdAt,
    } satisfies Partial<AyumiEntry> & Record<string, unknown>);
    if (!next) return bad("題名と日付を入れてください");
    const saved = await saveEntry(auth.admin, next, auth.user.email ?? auth.user.id);
    return NextResponse.json({ entry: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (!auth.canWrite) return hidden();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    const prev = id ? await loadEntry(auth.admin, id) : null;
    if (!prev || visibleEntries([prev], auth.user).length === 0) return hidden();
    await deleteEntryCascade(auth.admin, prev);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (!auth.canEditIntro) return hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.intro || typeof body.intro !== "object") return bad("不正なリクエストです");
  try {
    const intro = await saveIntro(auth.admin, normalizeIntro(body.intro), auth.user.email ?? auth.user.id);
    return NextResponse.json({ intro }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
