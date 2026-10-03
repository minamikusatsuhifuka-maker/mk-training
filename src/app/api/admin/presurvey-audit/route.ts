// 事前アンケートの閲覧権の整理状況（指示書200 1-4）— **院長のみ**
//   GET → { total, withPartner, revoked }
//   revoked = 相手が院長でも担当幹部でもないため、相手が読めなくなった回答の件数（数だけ。本文・氏名は返さない）
// /api/admin 配下は proxy が院長以外に「存在しないAPI」と同じ応答にする（委任の対応表にも載せない）。

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { auditPresurveyPartners } from "@/lib/presurvey-access-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await auditPresurveyPartners(createSupabaseAdminClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "集計に失敗しました" }, { status: 500 });
  }
}
