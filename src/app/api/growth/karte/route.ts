// スタッフ育成カルテAPI（指示書179 A）— **管理者のみ**。それ以外・未ログインは 404
//   GET ?probe=1  → { ok:true }（ナビのリンク判定用・中身は返さない）
//   GET           → 一覧 { entries, courses, tableMissing, today }
//   GET ?user=<id> → 個人のカルテ { entry, latestPromise, recentLearning, nextOneOnOne, timeline, goals, ... }
//   GET ?q=<検索語> → 横断検索 { hits: [{ userId, hits }] }
//
// 集約の中身と「権限を超えない」担保は lib/staff-growth-karte-server.ts を参照。
// 一覧（entries）の型には、家族構成・適性検査・サーベイの値・評価点が**項目として存在しない**（A-5）。

import { NextResponse } from "next/server";
import { authorizeGrowth } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import {
  buildKarteDetail,
  buildKarteList,
  searchKarte,
} from "@/lib/staff-growth-karte-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();

  const sp = new URL(req.url).searchParams;
  if (sp.get("probe") === "1") return NextResponse.json({ ok: true });

  try {
    const userId = sp.get("user") ?? "";
    if (userId) {
      const detail = await buildKarteDetail(auth.admin, auth.userId, userId);
      if (!detail) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json(detail);
    }
    const q = (sp.get("q") ?? "").trim();
    if (q) {
      const hits = await searchKarte(auth.admin, auth.userId, q.slice(0, 100));
      return NextResponse.json({ hits });
    }
    const list = await buildKarteList(auth.admin, auth.userId);
    return NextResponse.json(list);
  } catch (e) {
    return growthErrorResponse(e);
  }
}
