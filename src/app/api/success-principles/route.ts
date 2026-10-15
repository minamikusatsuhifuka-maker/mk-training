// 🌱 成長の行動例（成功の原則×行動例・考え方の例）— ログイン中のスタッフ全員
//
//   GET → { data }（docs/success-principles の .md から作ったスタッフ向けのデータ）
//
// 【見られる人】ログイン中のスタッフ全員（院長の承認済み）。未ログインは何も返さない（401）。
// 【返すもの】行動例と考え方の例。「問い：」「1on1の問い：」「※」の行は、データを作る時点で外してあり、ここからは返らない
//   （それらは管理画面の 📘 欲求別成長支援ガイド だけに出る）。どのAI処理にも渡さない。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { SUCCESS_STAFF } from "@/lib/success-principles-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  return NextResponse.json({ data: SUCCESS_STAFF }, { headers: { "Cache-Control": "no-store" } });
}
