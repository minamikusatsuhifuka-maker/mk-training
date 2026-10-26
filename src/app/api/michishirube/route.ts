// 🧭 成長の道しるべ（指示書270 第1部）
//   GET → { content }  ログインしたスタッフ全員（スイッチOFFの間は院長と検証用アカウントだけ・ほかは404）
// 【院長が直す】の印と、直した人の記録はスタッフには返さない（stripFixMarks）。

import { NextResponse } from "next/server";
import { authorizeMichiView, loadMichiContent } from "@/lib/michishirube-server";
import { stripFixMarks } from "@/lib/michishirube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await authorizeMichiView();
  if (!auth.ok) {
    return auth.status === 401
      ? NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE })
      : NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
  }
  try {
    const content = stripFixMarks(await loadMichiContent(auth.admin));
    return NextResponse.json({ content }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}
