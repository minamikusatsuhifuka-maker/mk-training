// 院内端末の番号（PIN）ログイン（指示書192・192-補）— 純粋部（画面・サーバー・テストで共用）
//
// 【院長の決定】院長が登録した院内端末でだけ、メール＋本人が決めた番号（4〜6桁）でログインできる。
//   院外・個人のスマートフォンはこれまでどおりパスワード。管理者（院長）は番号でログインできない。
//   番号ログインは管理画面のスイッチがONのときだけ動く（既定OFF・192-補）。
// 【守り】端末の鍵＝推測できない乱数（サーバーにはハッシュのみ）。番号＝scrypt＋乱数ソルト（189と同じ）。
//   アカウントごと 5回失敗→15分停止。端末ごと 1時間に20回失敗→一時停止。応答は「存在しない」と「違う」を区別しない。

export const DEVICE_COOKIE = "mkt_terminal";
/** 端末の鍵の有効期間（日） */
export const DEVICE_COOKIE_DAYS = 400;

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const PIN_LOCK_AFTER = 5;
export const PIN_LOCK_MINUTES = 15;
export const DEVICE_FAIL_LIMIT = 20;
export const DEVICE_FAIL_WINDOW_MINUTES = 60;
export const DEVICE_SUSPEND_MINUTES = 60;
export const IDLE_DEFAULT_MINUTES = 15;
export const IDLE_MIN_MINUTES = 5;
export const IDLE_MAX_MINUTES = 60;

/** 常時表示する注意（C-1） */
export const TERMINAL_NOTICE = "この端末ではパスワードを保存しないでください";
/** ONにした直後の案内（192-補 3） */
export const PIN_UNSET_HINT = "番号をまだ設定していない方は、パスワードでログインしてマイプロフィールで設定してください";

export type TerminalSetting = { pinLoginEnabled: boolean; idleMinutes: number; updatedAt: string; updatedBy: string };
export const DEFAULT_TERMINAL_SETTING: TerminalSetting = { pinLoginEnabled: false, idleMinutes: IDLE_DEFAULT_MINUTES, updatedAt: "", updatedBy: "" };

export function normalizeTerminalSetting(raw: unknown): TerminalSetting {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = typeof g.idleMinutes === "number" ? g.idleMinutes : Number(g.idleMinutes);
  return {
    pinLoginEnabled: g.pinLoginEnabled === true,
    idleMinutes: clampIdleMinutes(Number.isFinite(m) ? m : IDLE_DEFAULT_MINUTES),
    updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : "",
    updatedBy: typeof g.updatedBy === "string" ? g.updatedBy : "",
  };
}
export function clampIdleMinutes(m: number): number {
  return Math.max(IDLE_MIN_MINUTES, Math.min(IDLE_MAX_MINUTES, Math.round(m)));
}

// ─── 端末の鍵（Cookie の値 = <id>.<secret>）───

export function parseDeviceCookie(value: string | undefined | null): { id: string; secret: string } | null {
  if (!value) return null;
  const m = value.match(/^(dev-[A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{32,128})$/);
  return m ? { id: m[1], secret: m[2] } : null;
}

export type TerminalDevice = {
  id: string;
  name: string;
  /** 端末の鍵の SHA-256（hex）。鍵そのものは保存しない */
  secretHash: string;
  registeredAt: string;
  registeredBy: string;
  lastUsedAt: string;
  revokedAt: string;
  /** 失敗の窓の開始と回数（1時間に20回で一時停止） */
  failWindowStart: string;
  failCount: number;
  suspendedUntil: string;
};

export function normalizeTerminalDevice(id: string, raw: unknown): TerminalDevice | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const s = (k: string) => (typeof g[k] === "string" ? (g[k] as string) : "");
  if (!s("secretHash")) return null;
  return {
    id,
    name: s("name").slice(0, 60) || "院内端末",
    secretHash: s("secretHash"),
    registeredAt: s("registeredAt"),
    registeredBy: s("registeredBy"),
    lastUsedAt: s("lastUsedAt"),
    revokedAt: s("revokedAt"),
    failWindowStart: s("failWindowStart"),
    failCount: typeof g.failCount === "number" ? g.failCount : 0,
    suspendedUntil: s("suspendedUntil"),
  };
}

export function isDeviceSuspended(d: Pick<TerminalDevice, "suspendedUntil">, nowIso: string): boolean {
  return !!d.suspendedUntil && d.suspendedUntil > nowIso;
}

/** 端末ごとの失敗（C-3）: 1時間の窓で数え、20回に達したら1時間停止 */
export function nextDeviceFailState(
  d: Pick<TerminalDevice, "failWindowStart" | "failCount" | "suspendedUntil">,
  now: Date
): Pick<TerminalDevice, "failWindowStart" | "failCount" | "suspendedUntil"> {
  const nowIso = now.toISOString();
  const windowMs = DEVICE_FAIL_WINDOW_MINUTES * 60_000;
  const start = d.failWindowStart ? Date.parse(d.failWindowStart) : NaN;
  const inWindow = Number.isFinite(start) && now.getTime() - start < windowMs;
  const failCount = (inWindow ? d.failCount : 0) + 1;
  const failWindowStart = inWindow ? d.failWindowStart : nowIso;
  if (failCount >= DEVICE_FAIL_LIMIT) {
    return { failWindowStart: nowIso, failCount: 0, suspendedUntil: new Date(now.getTime() + DEVICE_SUSPEND_MINUTES * 60_000).toISOString() };
  }
  return { failWindowStart, failCount, suspendedUntil: d.suspendedUntil };
}

// ─── 番号（PIN）の規則（B）───

export function birthdayPins(birthday: string): string[] {
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const [, y, mo, d] = m;
  const yy = y.slice(2);
  return Array.from(new Set([`${mo}${d}`, `${d}${mo}`, `${yy}${mo}${d}`, `${mo}${d}${yy}`, `${y}${mo}`, `${yy}${mo}`, `${mo}${yy}`, `${y}`, `${d}${mo}${yy}`, `${y}${mo}${d}`.slice(0, 6), `${Number(mo)}${Number(d)}`.padStart(4, "0")]));
}

function isRepeat(pin: string): boolean {
  return /^(\d)\1+$/.test(pin);
}
function isSequence(pin: string): boolean {
  const asc = "01234567890";
  const desc = "09876543210";
  return asc.includes(pin) || desc.includes(pin) || "1234567890".includes(pin) || "0987654321".includes(pin);
}
/** 2桁の繰り返し（1212 など）も弱い番号として扱う */
function isPairRepeat(pin: string): boolean {
  return pin.length % 2 === 0 && /^(\d\d)\1+$/.test(pin);
}

/** 使えない番号なら理由を返す（空＝使える） */
export function validatePin(pin: unknown, birthday = ""): string {
  if (typeof pin !== "string") return "番号を入力してください";
  if (!/^\d+$/.test(pin)) return "番号は数字だけで入力してください";
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return `番号は${PIN_MIN}〜${PIN_MAX}桁にしてください`;
  if (pin === "0000" || pin === "1234") return "その番号は使えません（推測されやすい番号）";
  if (isRepeat(pin)) return "同じ数字の繰り返しは使えません";
  if (isSequence(pin)) return "連番は使えません";
  if (isPairRepeat(pin)) return "同じ並びの繰り返しは使えません";
  if (birthday && birthdayPins(birthday).includes(pin)) return "生年月日から作った番号は使えません";
  return "";
}

/** 端末の有効期限（Cookie）・自動ログアウトの表示用 */
export function idleMillis(setting: Pick<TerminalSetting, "idleMinutes">): number {
  return setting.idleMinutes * 60_000;
}

/** 番号ログインの応答は「存在しない」「違う」「停止中」を区別しない（C-3） */
export const PIN_LOGIN_FAILED = "メールアドレスまたは番号が違います";
