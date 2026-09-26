// サーベイ履歴API（指示書182 B）— **本人のみ**（セッションの userId に固定・他人の履歴は扱えない）
//   GET    → { entries（画像は署名URL・古い順）, showOptionsNotice }
//   POST   { action: "archive" }      → 現在の結果を履歴に移し、現在の結果を空にする（公開設定は維持）
//   POST   { action: "notice-seen" }  → 182 A-5 の案内を「見た」にする（1回だけ出すための印）
//   DELETE { id }                     → 履歴の1件を削除（画像も削除・本人の操作のみ）
//
// 履歴は content_store のサーバー専用キー（/api/content-store から読めない）。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, ServiceRoleMissingError } from "@/lib/supabase-admin";
import { getSessionUser, loadProfileServer, saveProfileServer } from "@/lib/staff-profiles-server";
import { signPublicUrls } from "@/lib/storage-signed";
import { hasSurveyContent } from "@/lib/needs-survey";
import {
  archiveCurrentSurvey,
  deleteSurveyHistoryEntry,
  loadSurveyHistory,
} from "@/lib/survey-history-server";
import type { SurveyHistoryEntry } from "@/lib/survey-history";

export const runtime = "nodejs";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

/** 履歴の画像を署名URLに差し替えて返す（保存値は公開URLのまま） */
async function withSignedEntries(entries: SurveyHistoryEntry[]): Promise<SurveyHistoryEntry[]> {
  const urls = entries.map((e) => e.imageUrl).filter(Boolean);
  if (urls.length === 0) return entries;
  let signed = new Map<string, string>();
  try {
    signed = await signPublicUrls(createSupabaseAdminClient(), urls);
  } catch {
    signed = new Map();
  }
  return entries.map((e) => ({ ...e, imageUrl: e.imageUrl ? (signed.get(e.imageUrl) ?? "") : "" }));
}

export async function GET() {
  const { user, db } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const [entries, profile] = await Promise.all([
      loadSurveyHistory(user.id),
      loadProfileServer(db, user.id),
    ]);
    const s = profile.needsSurvey;
    // 182 A-5: 「公開」のままで、新しい選択肢を見ていない人にだけ1回出す
    const showOptionsNotice =
      !!s && s.visibility === "public" && s.optionsNoticeSeen !== true && hasSurveyContent(s);
    return NextResponse.json({ entries: await withSignedEntries(entries), showOptionsNotice });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { user, db } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  try {
    const profile = await loadProfileServer(db, user.id);
    const now = new Date().toISOString();

    if (body.action === "notice-seen") {
      if (profile.needsSurvey) {
        profile.needsSurvey = { ...profile.needsSurvey, optionsNoticeSeen: true };
        await saveProfileServer(db, profile);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "archive") {
      const entry = await archiveCurrentSurvey(user.id, profile.needsSurvey);
      if (!entry) {
        return NextResponse.json({ error: "履歴に残す結果がありません" }, { status: 400 });
      }
      // 現在の結果を空にする（公開設定と案内の印は維持。画像は履歴に紐づいたまま残す）
      profile.needsSurvey = {
        visibility: profile.needsSurvey?.visibility ?? "private",
        optionsNoticeSeen: profile.needsSurvey?.optionsNoticeSeen,
        aiParsed: false,
        updatedAt: now,
      };
      await saveProfileServer(db, profile);
      const entries = await loadSurveyHistory(user.id);
      return NextResponse.json({ ok: true, entries: await withSignedEntries(entries) });
    }

    return NextResponse.json({ error: "action が不正です" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const ok = await deleteSurveyHistoryEntry(user.id, id);
    if (!ok) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const entries = await loadSurveyHistory(user.id);
    return NextResponse.json({ ok: true, entries: await withSignedEntries(entries) });
  } catch (e) {
    return errorResponse(e);
  }
}
