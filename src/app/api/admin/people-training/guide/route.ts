// 欲求別成長支援ガイド（管理画面「📘 欲求別成長支援ガイド」）— 院長・管理者と、人材育成研修の受講者に指定された人だけ
//   GET → { docs: [{ id, label, kind, file, markdown }]（7カテゴリー・.md の中身そのまま） }
//
// 【見られる人】requireAdminItem("people-training")＝管理者（app_metadata.role === "admin"）か、
//   院長が「⚙ 委任」で人材育成研修を任せた人（＝受講者）。それ以外は proxy でも、ここでも何も返さない（fail-closed）。
// 【返すもの】ガイドの本文だけ。スタッフの欲求の値・診断結果は返さない。どのAI処理にも渡さない。

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { PEOPLE_TRAINING_ITEM_KEY } from "@/lib/admin-items";
import { NEEDS_GUIDE_DOCS } from "@/lib/needs-guide-docs-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminItem(PEOPLE_TRAINING_ITEM_KEY);
  if (auth.response) return auth.response;
  return NextResponse.json(
    { docs: NEEDS_GUIDE_DOCS.filter((d) => d.kind === "guide") },
    { headers: { "Cache-Control": "no-store" } }
  );
}
