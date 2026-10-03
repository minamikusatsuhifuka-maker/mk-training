// 1on1の事前アンケートの保存（指示書200）— ログイン必須・本人のみ
//   POST { scheduleId, answers, authorName } → { record }
//
// - 回答は **院長・担当幹部が登録した「次回1on1の予定」（197 B-2）にだけ** ひもづける。予定の無い保存は受け付けない。
// - 1on1の日付と担当者（＝回答を読める相手）は **予定からサーバーが決める**。本人からは受け取らない。
// - 担当者が今も「院長、または院長がそのスタッフの担当に指定した幹部」かを保存のたびに確かめる。
// - 同じ予定への回答は1件（2回目以降は上書き）。保存先は private_store（one_on_one_presurvey）。
// - 汎用の /api/private-store からは事前アンケートを保存できない（そちらは400）。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { jstTodayYmd } from "@/lib/library";
import {
  createSupabaseAdminClient,
  fetchSchedule,
  partnerCandidates,
} from "@/lib/one-on-one-schedule-server";
import { partnerLabel } from "@/lib/one-on-one-schedule";
import {
  genPresurveyKey,
  normalizePresurveyAnswer,
  normalizePresurveyData,
  type PresurveyAnswer,
  type PresurveyData,
} from "@/lib/one-on-one-presurvey";
import { PRESURVEY_CONTENT_TYPE } from "@/lib/presurvey-access-server";
import { GrowthTableMissingError } from "@/lib/staff-growth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not Found" }, { status: 404 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

type Row = {
  id: string;
  owner_id: string;
  content_type: string;
  record_key: string;
  data: unknown;
  created_at: string;
  updated_at: string;
};

export async function POST(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("不正なリクエストです");
  }
  const scheduleId = typeof body.scheduleId === "string" ? body.scheduleId : "";
  if (!scheduleId) return bad("次回1on1が登録されてから回答してください");
  if (!Array.isArray(body.answers) || body.answers.length > 50) return bad("回答が不正です");
  const answers = body.answers
    .map(normalizePresurveyAnswer)
    .filter((a): a is PresurveyAnswer => a !== null);
  if (!answers.some((a) => a.text.trim() || a.choice || a.unchanged)) return bad("まだ何も書かれていません");
  const authorName = typeof body.authorName === "string" ? body.authorName.trim().slice(0, 100) : "";

  try {
    const db = createSupabaseAdminClient();
    const s = await fetchSchedule(db, scheduleId);
    // 自分の予定でなければ「無い」と同じ応答
    if (!s || s.userId !== user.id) return notFound();
    if (s.date < jstTodayYmd()) return bad("この1on1の日は過ぎています");
    // 担当者が今も院長か担当幹部か（担当を外された人を相手にしない）
    const candidates = await partnerCandidates(db, user.id);
    if (!candidates.some((c) => c.userId === s.partnerId)) {
      return bad("この1on1の担当者の指定が無効になっています。院長にお知らせください");
    }

    // 同じ予定への回答があれば上書き
    const { data: mine, error: listErr } = await db
      .from("private_store")
      .select("*")
      .eq("owner_id", user.id)
      .eq("content_type", PRESURVEY_CONTENT_TYPE);
    if (listErr) throw new Error(listErr.message);
    const existing = ((mine ?? []) as Row[]).find(
      (r) => normalizePresurveyData(r.data).scheduleId === s.id
    );
    const prev = existing ? normalizePresurveyData(existing.data) : null;

    const now = new Date().toISOString();
    const data: PresurveyData = {
      heldOn: s.date,
      scheduleId: s.id,
      participantIds: [s.partnerId],
      partnerName: partnerLabel(s).replace(/さん$/, ""),
      authorName: authorName || prev?.authorName || "",
      answers,
      submittedAt: prev?.submittedAt || now,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    };
    const { data: saved, error } = await db
      .from("private_store")
      .upsert(
        {
          owner_id: user.id,
          content_type: PRESURVEY_CONTENT_TYPE,
          record_key: existing?.record_key ?? genPresurveyKey(s.date),
          data,
          updated_at: now,
        },
        { onConflict: "owner_id,content_type,record_key" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const r = saved as Row;
    return NextResponse.json({
      record: {
        id: r.id,
        ownerId: r.owner_id,
        contentType: r.content_type,
        recordKey: r.record_key,
        data: r.data,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗しました" }, { status: 500 });
  }
}
