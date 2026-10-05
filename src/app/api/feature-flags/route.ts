// 機能フラグを「いまログインしている人の立場で」返すAPI（指示書203 §1）
//
//   GET → { flags, preview, previewReason, previewIds }
//
// 院長・検証用アカウントには、実装済みで「準備中」の機能もONにして返す（プレビュー）。
// **保存されたフラグは変えない**ので、一般スタッフには「準備中」のままになる。
// 役割の判定はこのサーバー側だけで行う（画面のJSを書き換えても開けない）。
//
// ログインは必須（未ログインには何も返さない）。読み取り専用。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { viewerFeatureFlags } from "@/lib/feature-preview-server";

export const runtime = "nodejs";

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  try {
    const resolved = await viewerFeatureFlags();
    if (!resolved) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    return NextResponse.json(resolved);
  } catch (e) {
    // 読めないときは呼び出し側が保存値（＝プレビューなし）に倒す
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
