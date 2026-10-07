// 1on1の事前アンケートの知らせのメール（指示書197 C-2 → 204 §6-2）— サーバー専用・**既定OFF**
//
// 【送る条件（3つそろったときだけ）】
//   1. 機能フラグ `one_on_one_presurvey` が ON（機能そのものがOFFの間は送らない・204 §6-1）
//   2. 切り替え `presurvey_alert_email`（管理画面「⚙ 機能」の「1on1の知らせ（事前アンケート・予定）をメールでも送る」・206 Aで改名）が ON・**既定OFF**
//   3. 送信の設定（RESEND_API_KEY）がある ＝ 指示書178の送信設定が済んでいる
// どれか欠ければ「送らない」を理由つきで返す（黙って落ちない）。
//
// 【本文に入れないもの（204 §6-2）】
//   回答の中身・目標・他の人の情報は入れない。**期限の日付と、事前アンケートへのリンクだけ**。
//
// 【検証用アカウントには送らない（204 §6-2）】
//   判定は呼び出し側（presurvey-alert-server）で行う。ここは渡された宛先に送るだけ。

import { serverFeatureEnabled } from "./staff-growth-server";
import { isMailConfigured, portalOrigin, sendPortalMail } from "./mail-send";
import { PRESURVEY_INTRO } from "./one-on-one-presurvey";
import {
  formatMonthDay,
  presurveyAlertStageLabel,
  type PresurveyAlert,
  type ScheduleReminder,
} from "./one-on-one-schedule";

export type PresurveyMailSkip =
  | "feature_off"
  | "flag_off"
  | "smtp_not_configured"
  | "no_email";

export type PresurveyMailResult =
  | { sent: true; reason: "" }
  | { sent: false; reason: PresurveyMailSkip | "failed"; detail?: string };

/** 送れる状態かだけを確かめる（宛先ごとに毎回調べ直さないため） */
export async function presurveyMailReady(): Promise<
  { ready: true } | { ready: false; reason: PresurveyMailSkip }
> {
  if (!(await serverFeatureEnabled("one_on_one_presurvey"))) {
    return { ready: false, reason: "feature_off" };
  }
  if (!(await serverFeatureEnabled("presurvey_alert_email"))) {
    return { ready: false, reason: "flag_off" };
  }
  if (!isMailConfigured()) return { ready: false, reason: "smtp_not_configured" };
  return { ready: true };
}

export function presurveyLink(scheduleId: string): string {
  return `${portalOrigin()}/one-on-one/presurvey?schedule=${encodeURIComponent(scheduleId)}`;
}

/** 件名と本文（回答の中身は入れない） */
export function buildPresurveyMail(alert: PresurveyAlert): { subject: string; text: string } {
  const subject = `【南草津皮フ科】1on1の事前アンケートのお願い（${formatMonthDay(alert.deadline)}まで）`;
  const text = [
    alert.message,
    "",
    `1on1の日：${formatMonthDay(alert.date)}`,
    `回答の締切：${formatMonthDay(alert.deadline)}（1on1の3日前）`,
    "",
    "回答はこちらから：",
    presurveyLink(alert.scheduleId),
    "",
    // 206-補 1: 画面の冒頭と**同じものを使う**（文の正本は one-on-one-presurvey.ts の PRESURVEY_INTRO）。
    //   206では写しを置いていたため画面とずれていた。**ここに文を書き写さないこと**。
    PRESURVEY_INTRO,
  ].join("\n");
  return { subject, text };
}

/** 205 §4: 1on1の予定の知らせ（前日・当日）。メールの中身は日時とリンクだけ */
export function buildScheduleReminderMail(r: ScheduleReminder): { subject: string; text: string } {
  const subject = `【南草津皮フ科】${formatMonthDay(r.date)}の1on1のお知らせ`;
  const text = [
    r.message,
    "",
    `1on1の日：${formatMonthDay(r.date)}${r.time ? ` ${r.time}から` : ""}`,
    "",
    "事前アンケート・予定はこちらから：",
    presurveyLink(r.scheduleId),
  ].join("\n");
  return { subject, text };
}

/** 205 §4: 予定の知らせを1人に送る */
export async function sendScheduleReminderMail(
  to: { email: string; name: string },
  reminder: ScheduleReminder
): Promise<PresurveyMailResult> {
  if (!to.email) return { sent: false, reason: "no_email" };
  const { subject, text } = buildScheduleReminderMail(reminder);
  const r = await sendPortalMail(to.email, subject, text);
  return r.ok ? { sent: true, reason: "" } : { sent: false, reason: "failed", detail: r.error };
}

/**
 * 205 §4: 予定の知らせを送れる状態か。
 * 事前アンケートとは別の機能フラグ（1on1の日程調整）で見る。
 */
export async function scheduleReminderMailReady(): Promise<
  { ready: true } | { ready: false; reason: PresurveyMailSkip }
> {
  if (!(await serverFeatureEnabled("one_on_one_booking"))) {
    return { ready: false, reason: "feature_off" };
  }
  if (!(await serverFeatureEnabled("presurvey_alert_email"))) {
    return { ready: false, reason: "flag_off" };
  }
  if (!isMailConfigured()) return { ready: false, reason: "smtp_not_configured" };
  return { ready: true };
}

/** 1人に送る。送れる状態かは presurveyMailReady で先に確かめてから呼ぶ */
export async function sendPresurveyReminderMail(
  to: { email: string; name: string },
  alert: PresurveyAlert
): Promise<PresurveyMailResult> {
  if (!to.email) return { sent: false, reason: "no_email" };
  const { subject, text } = buildPresurveyMail(alert);
  const r = await sendPortalMail(to.email, subject, text);
  return r.ok ? { sent: true, reason: "" } : { sent: false, reason: "failed", detail: r.error };
}

/**
 * 院長あての見本（204 §6-2）。文面と届き方の確認用。
 * スイッチがOFFでも、**送信の設定があれば送れる**（見本は院長宛てだけ）。
 */
export async function sendPresurveySampleMail(
  to: string
): Promise<PresurveyMailResult> {
  if (!isMailConfigured()) return { sent: false, reason: "smtp_not_configured" };
  if (!to) return { sent: false, reason: "no_email" };
  const sample: PresurveyAlert = {
    scheduleId: "sample",
    stage: "d7",
    date: "2026-10-20",
    deadline: "2026-10-17",
    message: "10月20日の1on1の事前アンケートをお願いします（10月17日まで）",
  };
  const { subject, text } = buildPresurveyMail(sample);
  const r = await sendPortalMail(
    to,
    `[見本] ${subject}`,
    [
      `これは見本です（実際にスタッフへ送られる文面の確認用）。送る時点：${presurveyAlertStageLabel("d7")}`,
      "",
      text,
    ].join("\n")
  );
  return r.ok ? { sent: true, reason: "" } : { sent: false, reason: "failed", detail: r.error };
}
