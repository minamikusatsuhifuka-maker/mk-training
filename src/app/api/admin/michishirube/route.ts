// 🧭 成長の道しるべ（中身）（指示書270 §2-2）— 院長＋委任の設定で「🧭 成長の道しるべ（中身）」を任された人
//   GET                                   → { content（【院長が直す】の印・直した記録つき）, isAdmin }
//   PUT { content, baseUpdatedAt }        → 直す（ステップ・学びのステップ・技能の業務一覧・学びの地図・【院長が直す】の印）
//   PUT { reset: true, baseUpdatedAt }    → はじめの中身（別紙のまま）に戻す
// 直したら、すぐスタッフの画面（/api/michishirube）に出る。直した日時と人を残す。

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  MICHI_ITEM_KEY,
  MichiConflictError,
  displayNameOf,
  loadMichiContent,
  resetMichiContent,
  saveMichiContent,
} from "@/lib/michishirube-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const gate = await requireAdminItem(MICHI_ITEM_KEY);
  if (gate.response) return gate.response;
  try {
    const content = await loadMichiContent(createSupabaseAdminClient());
    return NextResponse.json({ content, isAdmin: gate.isAdmin }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminItem(MICHI_ITEM_KEY);
  if (gate.response) return gate.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const base = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : "";
  const by = { id: gate.user.id, name: displayNameOf(gate.user) };
  try {
    const admin = createSupabaseAdminClient();
    const content =
      body.reset === true
        ? await resetMichiContent(admin, base, by)
        : body.content && typeof body.content === "object"
          ? await saveMichiContent(admin, body.content, base, by)
          : null;
    if (!content) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ content }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof MichiConflictError) return NextResponse.json({ error: e.message }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });
  }
}
