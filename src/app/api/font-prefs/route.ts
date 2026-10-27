// 🔤 フォントの設定（指示書271 §2-3）— 本人だけ
//   GET                    → { mine（本人の選択・無ければ null）, def（院長の既定・無ければ null）, effective（使うフォント） }
//   PUT { font, size }     → 本人の選択を残す（アカウントに結びつける＝パソコンでもスマートフォンでも同じ）
//   DELETE                 → 本人の選択を消す（「既定に戻す」＝院長の既定に従う）
// 読み書きできるのはセッションの本人の分だけ。ほかの人を指す引数は受け取らない。
// 返事のたびに Cookie（mk_font）も入れ直す＝次に開いたページの最初の描画から同じになる。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { fontToken, normalizeFontPref, resolveFontPref, type FontPref } from "@/lib/font-pref";
import {
  FONT_COOKIE,
  FONT_COOKIE_OPTIONS,
  fontPrefOfUser,
  loadFontDefaultCached,
  saveUserFontPref,
} from "@/lib/font-pref-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function reply(mine: FontPref | null, def: FontPref | null) {
  const effective = resolveFontPref(mine, def);
  const res = NextResponse.json({ mine, def, effective }, { headers: NO_STORE });
  res.cookies.set(FONT_COOKIE, fontToken(effective), FONT_COOKIE_OPTIONS);
  return res;
}

const unauthorized = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) return unauthorized();
  return reply(fontPrefOfUser(user), await loadFontDefaultCached());
}

export async function PUT(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return unauthorized();
  const pref = normalizeFontPref(await req.json().catch(() => null));
  if (!pref) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400, headers: NO_STORE });
  if (!(await saveUserFontPref(user.id, pref)))
    return NextResponse.json({ error: "保存できませんでした" }, { status: 500, headers: NO_STORE });
  return reply(pref, await loadFontDefaultCached());
}

export async function DELETE() {
  const { user } = await getSessionUser();
  if (!user) return unauthorized();
  if (!(await saveUserFontPref(user.id, null)))
    return NextResponse.json({ error: "保存できませんでした" }, { status: 500, headers: NO_STORE });
  return reply(null, await loadFontDefaultCached());
}
