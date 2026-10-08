// 1on1の録音・書き起こしの同意の印（指示書221 §1）
//
//   GET  ?user=<スタッフ>  → { consent: { on } | null, canEdit }
//   PUT  { userId, consented } → { consent }   ※**院長のみ**
//
// 【読める人】本人（自分の印）／院長／担当に指定された幹部（取り込めるかを画面で出すため）。
//   それ以外は404（存在も伏せる）。判定はサーバー側（one-on-one-transcript-server）。
// 【書ける人】院長だけ。印を外すこともできる（221 §1）。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { isAdminUser } from "@/lib/admin-role";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { loadKarteAssignments } from "@/lib/admin-delegation-server";
import { jstTodayYmd } from "@/lib/library";
import {
  loadTranscriptConsent,
  saveTranscriptConsent,
} from "@/lib/one-on-one-transcript-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

/** 読んでよいか（本人・院長・担当の幹部） */
async function canRead(userId: string, viewerId: string, isAdmin: boolean): Promise<boolean> {
  if (!userId) return false;
  if (isAdmin || userId === viewerId) return true;
  const assigned = await loadKarteAssignments(viewerId).catch(() => [] as string[]);
  return assigned.includes(userId);
}

export async function GET(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const isAdmin = isAdminUser(gate.user);
  const userId = (new URL(req.url).searchParams.get("user") ?? "").trim() || gate.user.id;
  if (!(await canRead(userId, gate.user.id, isAdmin))) return hidden();

  const admin = createSupabaseAdminClient();
  const consent = await loadTranscriptConsent(admin, userId);
  return NextResponse.json({
    consent: consent ? { on: consent.on } : null,
    canEdit: isAdmin,
  });
}

export async function PUT(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  if (!isAdminUser(gate.user)) return hidden(); // 印を付け外しできるのは院長だけ

  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; consented?: unknown };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "対象が指定されていません" }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    const consent = await saveTranscriptConsent(admin, {
      userId,
      consented: body.consented === true,
      on: jstTodayYmd(),
      by: gate.user.email ?? gate.user.id,
    });
    return NextResponse.json({ consent: consent ? { on: consent.on } : null, canEdit: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
}
