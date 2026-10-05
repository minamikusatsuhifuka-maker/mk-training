// 事前アンケートの提出の知らせを配る（指示書204 §6）— サーバー専用
//
// 【アプリ内の知らせ】は**この便では配らない**。本人の画面が予定から自分で計算して出す
// （197の仕組みのまま＝ホーム上部の帯・メニューの印・マイ成長記録）。ログインすれば必ず見える。
//
// 【メール】だけがこの仕組みで送られる。毎日決まった時刻（日本時間の朝8時）に1回動かす
// ＝ Vercel Cron（vercel.json の crons・23:00 UTC）→ /api/cron/presurvey-alert。
//
// 【送る・送らないの決まり（204 §6-1）】
//   ・知らせる日は**締切日を基準**に 7日前・3日前・前日・当日（1on1の日からは 10/6/4/3日前）
//   ・提出したら、その後は送らない
//   ・予定の登録がその日より後なら、過ぎた日のぶんは送らない（まとめて送らない）
//   ・送り損ねた日があっても、さかのぼって複数送らない（**いちばん新しい段だけ**）
//   ・1on1の日を変えたら新しい締切で数え直す（予定の日付から毎回計算するので自動）
//   ・予定の取り消し・アカウントの無効化で止まる
//   ・同じ回・同じ段を2回送らない（**送った記録**を clinic_staff_growth に残す）
//   ・検証用アカウントには送らない（アプリ内だけ）
//   ・事前アンケートの機能がOFFの間は送らない
//
// 【送った記録】clinic_staff_growth の record_type = "presurvey_alert_sent"（SQL不要）。
//   本文は残さない（誰の・どの予定の・どの段を・いつ送ったか だけ）。

import {
  GROWTH_TABLE,
  GrowthTableMissingError,
  isMissingTable,
  type GrowthAdminClient,
} from "./staff-growth-server";
import { fetchSchedules } from "./one-on-one-schedule-server";
import { isScheduleAnswered, presurveyAlertFor, type PresurveyAlert, type PresurveyAlertStage } from "./one-on-one-schedule";
import { normalizePresurveyData } from "./one-on-one-presurvey";
import { PRESURVEY_CONTENT_TYPE } from "./presurvey-access-server";
import { isTestSeedUser } from "./test-seed";
import { presurveyMailReady, sendPresurveyReminderMail } from "./presurvey-mail-server";

export const ALERT_SENT_TYPE = "presurvey_alert_sent";

/** 送った記録の行id（同じ回・同じ段で必ず同じになる＝2回送らない） */
export function alertSentId(scheduleId: string, stage: PresurveyAlertStage): string {
  return `psent-${scheduleId}-${stage}`;
}

export async function fetchAlertSentIds(admin: GrowthAdminClient): Promise<Set<string>> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("id")
    .eq("record_type", ALERT_SENT_TYPE);
  if (error) {
    if (isMissingTable(error.message)) throw new GrowthTableMissingError();
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as { id: unknown }[]).map((r) => String(r.id)));
}

async function markAlertSent(
  admin: GrowthAdminClient,
  args: { scheduleId: string; stage: PresurveyAlertStage; userId: string; date: string; deadline: string }
): Promise<void> {
  const at = new Date().toISOString();
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id: alertSentId(args.scheduleId, args.stage),
    record_type: ALERT_SENT_TYPE,
    // 本文は残さない
    data: { ...args, sentAt: at, channel: "mail" },
    updated_by: "cron",
    updated_at: at,
  });
  if (error) throw new Error(error.message);
}

export type PresurveyAlertOutcome = {
  status: "sent" | "skipped";
  /** 送らなかった理由（機能OFF・切り替えOFF・送信設定なし など） */
  reason?: string;
  /** 対象になった予定の数（締切前で未提出・今日が知らせる日） */
  due: number;
  /** 実際に送った数 */
  sent: number;
  /** 送らなかった内訳（本文・氏名は入れない） */
  skippedTestSeed: number;
  alreadySent: number;
  noEmail: number;
  failures: string[];
};

/**
 * 今日ぶんの知らせを配る。today は日本時間の "YYYY-MM-DD"。
 * アプリ内の知らせは画面側が出すので、ここが送るのは**メールだけ**。
 */
export async function dispatchPresurveyAlerts(
  admin: GrowthAdminClient,
  today: string
): Promise<PresurveyAlertOutcome> {
  const base: PresurveyAlertOutcome = {
    status: "skipped",
    due: 0,
    sent: 0,
    skippedTestSeed: 0,
    alreadySent: 0,
    noEmail: 0,
    failures: [],
  };

  const ready = await presurveyMailReady();
  if (!ready.ready) return { ...base, reason: ready.reason };

  const { schedules, tableMissing } = await fetchSchedules(admin);
  if (tableMissing) return { ...base, reason: "table_missing" };

  // 回答（提出したかだけを見る。本文は使わない）
  const { data: rows, error } = await admin
    .from("private_store")
    .select("owner_id, data")
    .eq("content_type", PRESURVEY_CONTENT_TYPE);
  if (error) throw new Error(error.message);
  const answersByUser = new Map<string, ReturnType<typeof normalizePresurveyData>[]>();
  for (const r of (rows ?? []) as { owner_id: string; data: unknown }[]) {
    const list = answersByUser.get(r.owner_id) ?? [];
    list.push(normalizePresurveyData(r.data));
    answersByUser.set(r.owner_id, list);
  }

  // 宛先（メール・検証用の印・無効化）
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const userById = new Map((users?.users ?? []).map((u) => [u.id, u]));

  const sentIds = await fetchAlertSentIds(admin);
  const out = { ...base, status: "sent" as const };

  for (const s of schedules) {
    const user = userById.get(s.userId);
    if (!user) continue; // アカウントが無い＝止まる
    // 無効化されたアカウントには送らない
    const banned = (user as { banned_until?: unknown }).banned_until;
    if (typeof banned === "string" && banned && banned !== "none") continue;

    const answered = isScheduleAnswered(s, answersByUser.get(s.userId) ?? []);
    const alert: PresurveyAlert | null = presurveyAlertFor(s, today, answered);
    if (!alert) continue;
    out.due += 1;

    if (sentIds.has(alertSentId(s.id, alert.stage))) {
      out.alreadySent += 1;
      continue;
    }
    if (isTestSeedUser(user)) {
      out.skippedTestSeed += 1;
      continue;
    }
    const email = user.email ?? "";
    if (!email) {
      out.noEmail += 1;
      continue;
    }
    const name = ((user.user_metadata ?? {}) as { display_name?: unknown }).display_name;
    const r = await sendPresurveyReminderMail(
      { email, name: typeof name === "string" ? name : "" },
      alert
    );
    if (r.sent) {
      await markAlertSent(admin, {
        scheduleId: s.id,
        stage: alert.stage,
        userId: s.userId,
        date: s.date,
        deadline: alert.deadline,
      });
      out.sent += 1;
    } else {
      // 送れなかった日は記録を残さない（翌日の便で同じ段をもう一度試せる）
      out.failures.push(`${alert.stage}: ${r.reason}${r.detail ? ` (${r.detail})` : ""}`);
    }
  }
  return out;
}
