// メール送信の口（指示書204 §6-2）— サーバー専用
//
// 送信は Resend の REST を fetch で直接叩く（SDK依存を増やさない）。
// **環境変数が未設定なら送信を試みない**（理由を返すだけ）。設定前でもアプリは壊れない＝fail-safe。
//
// 155（書類進捗の滞留アラート・doc-tasks-mail.ts）と同じ作法だが、
// あちらは155の再送制御・記録とひとつづきになっているので、**この層は切り出して共有しない**。
// ここは「1通送る」だけを持つ。宛先は**必ず1件ずつ**送る（156の教訓：
// まとめて to: [...] にすると、1件の失敗が他の宛先を巻き込む）。
//
// 【必要な環境変数（院長がVercelに設定）】
//   RESEND_API_KEY        … Resend のAPIキー。**未設定＝メールは送らない**
//   DOC_TASKS_MAIL_FROM   … 差出人（155と共通。未設定時は下の既定値）

const DEFAULT_FROM = "南草津皮フ科ポータル <onboarding@resend.dev>";

/** メール送信が使える状態か（APIキーの有無だけ・キー自体は返さない） */
export function isMailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function mailFrom(): string {
  return process.env.DOC_TASKS_MAIL_FROM || DEFAULT_FROM;
}

/** 本番のポータルのURL（Vercelが自動で入れる本番ドメインを使う） */
export function portalOrigin(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || "mk-training.vercel.app";
  return `https://${host}`;
}

export type MailSendResult = { ok: boolean; error: string };

/** 1通送る。失敗しても例外にしない（理由を返す） */
export async function sendPortalMail(
  to: string,
  subject: string,
  text: string
): Promise<MailSendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY が未設定です" };
  if (!to) return { ok: false, error: "宛先がありません" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom(), to: [to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 160)}` };
    }
    return { ok: true, error: "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "送信に失敗しました" };
  }
}
