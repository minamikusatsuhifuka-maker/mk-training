// スタッフ育成カルテAPI（指示書179 A／183 A）— **管理者**、または担当スタッフを指定された**幹部**。それ以外・未ログインは 404
//   幹部（183）: 応答は担当スタッフの「学び・目標・1on1の約束と取り組み状況・公開サーベイ」だけでサーバーが組み立てる。
//   担当外・自分自身のカルテは「存在しない」と同じ404。閲覧は記録する（誰のカルテを・いつ。本文なし・院長のみ閲覧）
//   GET ?probe=1  → { ok:true }（ナビのリンク判定用・中身は返さない）
//   GET           → 一覧 { entries, courses, tableMissing, today }
//   GET ?user=<id> → 個人のカルテ { entry, latestPromise, recentLearning, nextOneOnOne, timeline, goals, ... }
//   GET ?q=<検索語> → 横断検索 { hits: [{ userId, hits }] }
//
// 集約の中身と「権限を超えない」担保は lib/staff-growth-karte-server.ts を参照。
// 一覧（entries）の型には、家族構成・適性検査・サーベイの値・評価点が**項目として存在しない**（A-5）。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff, recordGrowthLog } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { authorizeStaffContacts } from "@/lib/staff-contacts-server";
import {
  buildKarteDetail,
  buildKarteList,
  searchKarte,
  type KarteScope,
} from "@/lib/staff-growth-karte-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  // 管理者、または担当スタッフが1人以上指定された幹部だけ
  if (!auth.isAdmin && auth.assignedStaffIds.length === 0) return hidden();
  const scope: KarteScope = auth.isAdmin
    ? { mode: "full" }
    : { mode: "delegate", staffIds: auth.assignedStaffIds };

  const sp = new URL(req.url).searchParams;
  if (sp.get("probe") === "1") return NextResponse.json({ ok: true });

  try {
    const userId = sp.get("user") ?? "";
    if (userId) {
      // 幹部: 担当外・自分自身は「存在しない」と同じ応答（実在するかどうかを知らせない）
      if (!canViewStaff(auth, userId)) return hidden();
      const detail = await buildKarteDetail(auth.admin, auth.userId, userId, scope);
      if (!detail) return auth.isAdmin ? NextResponse.json({ error: "対象が見つかりません" }, { status: 404 }) : hidden();
      if (!auth.isAdmin) {
        // 183 A-5: 幹部の閲覧を記録（誰のカルテを・いつ。本文は残さない）
        await recordGrowthLog(auth.admin, {
          by: auth.userEmail || auth.userId,
          action: "閲覧",
          kind: "育成カルテ",
          target: detail.entry.name,
          changes: [],
        });
      }
      // 188 5: 名前の横の「📇 連絡先」は、連絡先を見る権限がある人（院長・169で指名された人）にだけ出す
      let contactAccess = false;
      try {
        contactAccess = (await authorizeStaffContacts()).ok;
      } catch {
        contactAccess = false;
      }
      return NextResponse.json({ ...detail, isAdmin: auth.isAdmin, contactAccess });
    }
    const q = (sp.get("q") ?? "").trim();
    if (q) {
      const hits = await searchKarte(auth.admin, auth.userId, q.slice(0, 100), scope);
      return NextResponse.json({ hits });
    }
    const list = await buildKarteList(auth.admin, auth.userId, scope);
    return NextResponse.json({ ...list, isAdmin: auth.isAdmin });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
