// 1on1の事前アンケートの知らせをメールで送る口（指示書197 C-2）— サーバー専用・**既定OFF**
//
// スタッフ宛のメール送信はまだ整っていない（指示書178の独自SMTPが未設定）。
// この便ではアプリ内の知らせだけを使い、メールは次の2つがそろったときだけ送る作りにしておく。
//   1. 機能フラグ presurvey_alert_email が ON（管理画面「🚀 機能の表示設定」・既定OFF）
//   2. 178 の送信設定（環境変数 STAFF_SMTP_URL）がある
// 2 がそろうまでは常に「送らない」を返す（送信の実装は178で入れる。ここで外部に送ることはない）。
// メールの本文に回答の中身は入れない（知らせの文だけ）。

import { serverFeatureEnabled } from "./staff-growth-server";
import type { PresurveyAlert } from "./one-on-one-schedule";

export type PresurveyMailResult = { sent: false; reason: "flag_off" | "smtp_not_configured" };

export async function sendPresurveyReminderMail(
  _to: { email: string; name: string },
  _alert: PresurveyAlert
): Promise<PresurveyMailResult> {
  void _to; // 178 で宛先・本文に使う
  void _alert;
  if (!(await serverFeatureEnabled("presurvey_alert_email"))) return { sent: false, reason: "flag_off" };
  if (!process.env.STAFF_SMTP_URL) return { sent: false, reason: "smtp_not_configured" };
  // 178 で送信処理を入れるまでは送らない
  return { sent: false, reason: "smtp_not_configured" };
}
