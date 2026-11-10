// 🧭 欲求の一覧（指示書276）の API — 院長だけ。ほかは誰でも 404（存在しないAPIと同じ）
//   GET ?probe=1       → { ok: true }（院長の画面に入口を出すかどうか）
//   GET                → 一覧 { people, roles, levels }
//   GET ?user=<userId> → 一人ずつ { snapshots }（新しい順・本人の公開設定どおり）
//
// proxy.ts：/api/admin 配下で API_ITEM_MAP に無い＝管理者だけが届く。ここで院長（DIRECTOR_USER_ID）かをもう一度確かめる。
// 読むだけ（POST/PUT/DELETE は持たない）。書き出し・一括ダウンロードは作らない（指示書276 §1）。

import { NextResponse } from "next/server";
import { hidden } from "@/lib/staff-growth-route";
import { authorizeNeedsOverview, loadNeedsOverviewList, loadNeedsOverviewPerson } from "@/lib/needs-overview-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const auth = await authorizeNeedsOverview();
  if (!auth) return hidden();
  const sp = new URL(req.url).searchParams;
  if (sp.get("probe") === "1") return NextResponse.json({ ok: true }, { headers: NO_STORE });
  try {
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
