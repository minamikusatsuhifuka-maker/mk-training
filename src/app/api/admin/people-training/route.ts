// 人材育成研修（管理画面「🎓 人材育成研修」）— 院長と、受講者に指定された人だけ
//   院長は環境変数 DIRECTOR_USER_ID で見分ける（people-training-server）。ほかの管理者は、指定されていなければ 404
//   GET → { doc（STEP3-2 の .md そのまま）, guideDocs（各章へのリンク用・名前だけ）, isAdmin（＝院長か）,
//           trainees?（院長だけ：今の受講者）, logs?（院長だけ：指定・解除の記録） }
//
// 【受講者の指定】院長だけが「⚙ 委任」（/api/admin/delegation・院長のみ）で、この項目を任せる／外す。
//   既存の委任の仕組み（1on1の日程・イベントの出欠と同じ menu_access）をそのまま使う＝新しい表・SQLは無い。
//   外すとすぐ見られなくなる（毎回 menu_access を読む・キャッシュしない）。
// 【記録】指定・解除は /api/admin/delegation が操作ログに名前つきで残す（いつ・誰を）。ここは院長にだけ返す。
// 【返すもの】研修の本文と、受講者の名前（院長だけ）。スタッフの欲求の値・診断結果は返さない。どのAI処理にも渡さない。
//   GET ?probe=1 → { guide: true, training }（254：左のメニューの入口を出すかどうかだけ。本文は返さない）
//     guide＝「📘 欲求別成長支援ガイド」を開ける（この口を通れた＝管理者か受講者）／training＝「🎓 人材育成研修」も開ける

import { NextResponse } from "next/server";
import { requireAdminItem, loadDelegationSnapshot } from "@/lib/admin-delegation-server";
import { PEOPLE_TRAINING_ITEM_KEY } from "@/lib/admin-items";
import { NEEDS_GUIDE_DOCS } from "@/lib/needs-guide-docs-server";
import { PEOPLE_TRAINING_LOG_TARGET } from "@/lib/people-training";
import { authorizeGrowth, fetchGrowthLogs } from "@/lib/staff-growth-server";
import { loadPeople } from "@/lib/one-on-one-schedule-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canSeePeopleTraining, isDirectorUser } from "@/lib/people-training-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdminItem(PEOPLE_TRAINING_ITEM_KEY);
  if (auth.response) return auth.response;
  // 254: 左のメニューの入口の判定だけ（ガイドは requireAdminItem を通れば開ける・研修はさらに院長か受講者）
  if (new URL(req.url).searchParams.get("probe") === "1") {
    return NextResponse.json({ guide: true, training: await canSeePeopleTraining(auth) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!(await canSeePeopleTraining(auth))) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const doc = NEEDS_GUIDE_DOCS.find((d) => d.kind === "training") ?? null;
  const guideDocs = NEEDS_GUIDE_DOCS.filter((d) => d.kind === "guide").map(({ id, label, file }) => ({ id, label, file }));
  // 受講者・記録は院長だけ（ほかの管理者・受講者には返さない）
  const director = isDirectorUser(auth.user);
  const body: Record<string, unknown> = { doc, guideDocs, isAdmin: director };

  if (director) {
    // 今の受講者（名前だけ）と、指定・解除の記録
    try {
      const snap = await loadDelegationSnapshot();
      const ids = snap.items[PEOPLE_TRAINING_ITEM_KEY] ?? [];
      const people = await loadPeople(createSupabaseAdminClient());
      body.trainees = ids.map((id) => ({ userId: id, name: people.get(id)?.name ?? "名前未設定" }));
    } catch {
      body.trainees = [];
    }
    try {
      const g = await authorizeGrowth();
      if (g.ok) {
        const { logs } = await fetchGrowthLogs(g.admin, { limit: 500 });
        body.logs = logs
          .filter((l) => l.target === PEOPLE_TRAINING_LOG_TARGET)
          .map((l) => ({ at: l.at, changes: l.changes }));
      }
    } catch {
      body.logs = [];
    }
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
