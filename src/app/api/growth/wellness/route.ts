// 1on1の「ウェルネスの視点」API（指示書 mk_training_karte_wellness_1on1）
//
//   GET [?user=]  → { entries: WellnessEntry[], scope: { all, staffIds } }
//                   user なし＝見られる全員分（院長＝全員／担当の幹部＝担当スタッフ）
//   PUT { userId, ownerId, oneOnOneKey, tags, notes } → { entry }（tags が空なら行を消して entry: null）
//   DELETE ?user=&owner=&key=  → { ok: true }
//
// 【見られる人（fail-closed）】院長＝全スタッフ分／担当に指定された幹部＝担当スタッフ分だけ。
//   **スタッフ本人には返さない**（院長であっても自分自身の分は扱わない）。
//   未ログイン・無効化・機能の対象外は 404（可能性ノートのAPIと同じ存在秘匿）。
//   ログインしていて範囲外の人のこと（担当外・本人）は 403。
// 【流さない】このデータは評価・等級・AI院長・書き出し・年表・印刷のどこにも集めない。
//   ここ以外に record_type "wellness" を読むコードを置かない。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import {
  deleteWellnessEntry,
  fetchOneOnOneRef,
  fetchOneOnOneRefs,
  fetchWellnessEntries,
  saveWellnessEntry,
} from "@/lib/wellness-server";
import {
  normalizeWellnessNotes,
  normalizeWellnessTags,
  wellnessId,
  type WellnessEntry,
} from "@/lib/wellness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

type Auth = Extract<Awaited<ReturnType<typeof authorizeGrowth>>, { ok: true }>;

/** この人のウェルネスの視点を扱えるか（本人は不可・院長は全員・幹部は担当だけ） */
function canHandle(auth: Auth, userId: string): boolean {
  return !!userId && userId !== auth.userId && canViewStaff(auth, userId);
}

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const user = new URL(req.url).searchParams.get("user") ?? "";

  let ids: string[] | undefined;
  if (user) {
    if (!canHandle(auth, user)) return forbidden();
    ids = [user];
  } else if (auth.isAdmin) {
    ids = undefined;
  } else if (auth.assignedStaffIds.length > 0) {
    ids = auth.assignedStaffIds;
  } else {
    return forbidden();
  }

  try {
    const [entries, refs] = await Promise.all([fetchWellnessEntries(auth.admin, ids), fetchOneOnOneRefs(auth.admin)]);
    const out = entries
      // 念のため行ごとにも確かめる（読み出しの絞り込みが崩れても本人・担当外を返さない）
      .filter((e) => canHandle(auth, e.userId))
      // 消された1on1の視点は出さない。実施日は1on1の記録から取り直す
      .flatMap((e) => {
        const ref = refs.get(`${e.ownerId}/${e.oneOnOneKey}`);
        if (!ref || !ref.involved.includes(e.userId)) return [];
        return [{ ...e, heldOn: ref.heldOn || e.heldOn }];
      });
    return NextResponse.json({
      entries: out,
      scope: { all: auth.isAdmin, staffIds: auth.isAdmin ? [] : auth.assignedStaffIds },
    });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const userId = typeof body.userId === "string" ? body.userId : "";
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
  const oneOnOneKey = typeof body.oneOnOneKey === "string" ? body.oneOnOneKey : "";
  if (!userId || !ownerId || !oneOnOneKey) return badRequest("対象の1on1が指定されていません");
  if (!canHandle(auth, userId)) return forbidden();

  try {
    // その1on1が本当にあり、その人が記録者か相手として関わっている回だけ
    const ref = await fetchOneOnOneRef(auth.admin, ownerId, oneOnOneKey);
    if (!ref || !ref.involved.includes(userId)) return hidden();

    const id = wellnessId(userId, ownerId, oneOnOneKey);
    const tags = normalizeWellnessTags(body.tags);
    if (tags.length === 0) {
      // 何も選ばない＝この回の視点は無し（行を残さない）
      await deleteWellnessEntry(auth.admin, id);
      return NextResponse.json({ entry: null });
    }
    const entry: WellnessEntry = {
      id,
      userId,
      ownerId,
      oneOnOneKey,
      heldOn: ref.heldOn,
      tags,
      notes: normalizeWellnessNotes(body.notes, tags),
      updatedAt: new Date().toISOString(),
    };
    await saveWellnessEntry(auth.admin, entry, auth.userEmail || auth.userId);
    return NextResponse.json({ entry });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const sp = new URL(req.url).searchParams;
  const userId = sp.get("user") ?? "";
  const ownerId = sp.get("owner") ?? "";
  const oneOnOneKey = sp.get("key") ?? "";
  if (!userId || !ownerId || !oneOnOneKey) return badRequest("対象の1on1が指定されていません");
  if (!canHandle(auth, userId)) return forbidden();
  try {
    await deleteWellnessEntry(auth.admin, wellnessId(userId, ownerId, oneOnOneKey));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
