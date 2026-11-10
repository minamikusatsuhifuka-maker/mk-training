// 🧭 欲求の一覧（指示書276）の API — 院長だけ。ほかは誰でも 404（存在しないAPIと同じ）
//   GET ?probe=1       → { ok: true }（院長の画面に入口を出すかどうか）
//   GET                → 一覧 { people, roles, levels }
//   GET ?user=<userId> → 一人ずつ { snapshots }（新しい順・本人の公開設定どおり／277 のスイッチが ON なら全部）
//   GET ?view=1        → 277 のスイッチの状態・文・記録と、お知らせを確認した人／まだの人
//   POST { action: "switch", on } / { action: "texts", texts } → 277 のスイッチと文（院長だけ）
//
// proxy.ts：/api/admin 配下で API_ITEM_MAP に無い＝管理者だけが届く。ここで院長（DIRECTOR_USER_ID）かをもう一度確かめる。
// サーベイは読むだけ。書くのは 277 のスイッチと文だけ。書き出し・一括ダウンロードは作らない（指示書276 §1）。

import { NextResponse } from "next/server";
import { hidden } from "@/lib/staff-growth-route";
import { authorizeNeedsOverview, loadNeedsOverviewList, loadNeedsOverviewPerson } from "@/lib/needs-overview-server";
import { listNeedsDirectorAcks, loadNeedsDirectorView, saveNeedsDirectorView } from "@/lib/needs-director-view-server";
import { setNeedsDirectorTexts, switchNeedsDirectorView } from "@/lib/needs-director-view";
import { displayNameOf } from "@/lib/staff-profiles-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const auth = await authorizeNeedsOverview();
  if (!auth) return hidden();
  const sp = new URL(req.url).searchParams;
  if (sp.get("probe") === "1") return NextResponse.json({ ok: true }, { headers: NO_STORE });
  try {
    if (sp.get("view") === "1") {
      const state = await loadNeedsDirectorView();
      return NextResponse.json({ state, ...(await listNeedsDirectorAcks(state)) }, { headers: NO_STORE });
    }
    const userId = sp.get("user");
    if (userId) {
      const snapshots = await loadNeedsOverviewPerson(auth, userId);
      if (!snapshots) return hidden();
      return NextResponse.json({ snapshots }, { headers: NO_STORE });
    }
    return NextResponse.json(await loadNeedsOverviewList(auth), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込みに失敗しました" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const auth = await authorizeNeedsOverview();
  if (!auth) return hidden();
  let body: { action?: unknown; on?: unknown; texts?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  try {
    const actor = { id: auth.user.id, name: displayNameOf(auth.user) };
    const now = new Date().toISOString();
    const cur = await loadNeedsDirectorView();
    let next;
    if (body.action === "switch" && typeof body.on === "boolean") next = switchNeedsDirectorView(cur, body.on, actor, now);
    else if (body.action === "texts") next = setNeedsDirectorTexts(cur, body.texts, actor, now);
    else return NextResponse.json({ error: "action が不正です" }, { status: 400, headers: NO_STORE });
    if (next !== cur) await saveNeedsDirectorView(next, auth.user.id);
    return NextResponse.json({ state: next, ...(await listNeedsDirectorAcks(next)) }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗しました" }, { status: 500, headers: NO_STORE });
  }
}
