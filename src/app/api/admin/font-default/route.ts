// 🔤 全員の既定のフォント（指示書271 §2）— 院長＋委任の設定で任された人
//   GET                  → { def（院長の既定・まだ決めていなければ null）, builtin（あ標準・標準） }
//   PUT { font, size }   → 全員の既定を決める（本人が選んでいない人と、ログインしていない画面に使う）
// 直した日時と人を残す。content_store の portal_font_default は /api/content-store からは書けない（ここだけ）。

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { displayNameOf } from "@/lib/staff-profiles-server";
import { BUILTIN_FONT_PREF, normalizeFontPref } from "@/lib/font-pref";
import { loadFontDefaultRecord, saveFontDefault } from "@/lib/font-pref-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_DEFAULT_ITEM_KEY = "font-default";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const gate = await requireAdminItem(FONT_DEFAULT_ITEM_KEY);
  if (gate.response) return gate.response;
  return NextResponse.json({ def: await loadFontDefaultRecord(), builtin: BUILTIN_FONT_PREF }, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  const gate = await requireAdminItem(FONT_DEFAULT_ITEM_KEY);
  if (gate.response) return gate.response;
  const pref = normalizeFontPref(await req.json().catch(() => null));
  if (!pref) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400, headers: NO_STORE });
  if (!(await saveFontDefault(pref, { id: gate.user.id, name: displayNameOf(gate.user) })))
    return NextResponse.json({ error: "保存できませんでした" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ def: await loadFontDefaultRecord(), builtin: BUILTIN_FONT_PREF }, { headers: NO_STORE });
}
