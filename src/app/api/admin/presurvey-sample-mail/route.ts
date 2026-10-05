// 事前アンケートの知らせメールの見本を院長あてに1通送る（指示書204 §6-2）— 院長のみ
//
//   POST → { sent } / { sent:false, reason }
//
// 文面と届き方の確認用。宛先は**ログインしている院長のメールアドレスだけ**（指定は受け取らない）。
// 「メールでも知らせる」がOFFでも、送信の設定（RESEND_API_KEY）があれば見本は送れる。
// 178の送信設定が済んでいなければ、理由（smtp_not_configured）を返す（送らない）。

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sendPresurveySampleMail } from "@/lib/presurvey-mail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const to = auth.user.email ?? "";
  const r = await sendPresurveySampleMail(to);
  return NextResponse.json({
    ...r,
    // 宛先は院長自身なので返してよい（他人のアドレスは扱わない）
    to: r.sent ? to : "",
  });
}
