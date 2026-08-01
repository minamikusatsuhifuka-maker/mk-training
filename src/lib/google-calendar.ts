// Google Calendar 連携（指示書114・機能ID calendar）— サーバー専用
// - REST 直叩き（依存パッケージ追加なし・院長決定）。JWT（RS256）署名は Node 標準 crypto。
// - このファイルは API ルート（/api/calendar）からのみ import する。クライアントに持ち込まない。
// - 秘密鍵・アクセストークンをログ・エラーメッセージ・応答に一切含めない（技術制約）。
// - キャッシュは module スコープ＝サーバーレスのウォームインスタンス単位。
//   認証付き応答のため CDN キャッシュは使わない（ルート側で Cache-Control: no-store）。

import crypto from "crypto";
import { jstTodayYmd } from "./library";

// ─── 設定ローダー（env 3点・読み込みはここに集約） ───

export const CALENDAR_ENV_VARS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_CALENDAR_ID",
] as const;

export type CalendarConfig = {
  email: string;
  privateKey: string;
  calendarId: string;
};

// env値の掃除: 前後の空白・改行を trim ＋ 誤って値ごと貼られた引用符を剥がす。
// 既知事故: Vercel env の末尾リテラル \n 混入（指示書63で実証）に備え、\n 復元より先に trim する
function cleanEnv(v: string | undefined): string {
  let s = (v ?? "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// 未設定の変数名リストを返す（変数名は秘密ではない・管理者向け詳細に使う。値は返さない）
export function loadCalendarConfig(): {
  config: CalendarConfig | null;
  missing: string[];
} {
  const email = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const rawKey = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const calendarId = cleanEnv(process.env.GOOGLE_CALENDAR_ID);
  const missing: string[] = [];
  if (!email) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!rawKey) missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!calendarId) missing.push("GOOGLE_CALENDAR_ID");
  if (missing.length > 0) return { config: null, missing };
  // リテラル "\n" を実改行に復元し、復元後にも前後を trim
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();
  return { config: { email, privateKey, calendarId }, missing: [] };
}

// ─── Google API エラー（ルート側で 502 detail に使う。鍵・トークンは含まれない） ───

export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

// ─── アクセストークン（キャッシュ1段目: 有効期限内は再利用） ───

let tokenCache: { token: string; expiresAt: number } = {
  token: "",
  expiresAt: 0,
};

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(config: CalendarConfig): Promise<string> {
  const now = Date.now();
  // 期限の60秒前までは再利用（境界での失効を避ける）
  if (tokenCache.token && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: config.email,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(config.privateKey).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleApiError(
      res.status,
      `アクセストークンの取得に失敗しました (HTTP ${res.status}): ${body.slice(0, 200)}`
    );
  }
  const j = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!j.access_token) {
    throw new GoogleApiError(500, "トークン応答に access_token がありません");
  }
  tokenCache = {
    token: j.access_token,
    expiresAt: now + (j.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

// ─── イベント一覧（キャッシュ2段目: 5分TTL ＋ 取得中Promise共有） ───

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO日時（終日は "YYYY-MM-DD"）
  end: string;
  allDay: boolean;
  location: string;
};

const EVENTS_TTL_MS = 5 * 60 * 1000;
let eventsCache: { events: CalendarEvent[]; fetchedAt: number } | null = null;
let inFlight: Promise<CalendarEvent[]> | null = null;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type GcalItem = {
  id?: unknown;
  summary?: unknown;
  location?: unknown;
  start?: { date?: unknown; dateTime?: unknown };
  end?: { date?: unknown; dateTime?: unknown };
};

// 応答は最小フィールドにマップ（description 等、表示に使わない情報を運ばない・指示書114）
function mapEvent(item: GcalItem): CalendarEvent | null {
  const id = str(item.id);
  const allDay = !!str(item.start?.date);
  const start = str(item.start?.dateTime) || str(item.start?.date);
  const end = str(item.end?.dateTime) || str(item.end?.date);
  if (!id || !start) return null;
  return {
    id,
    title: str(item.summary) || "（無題）",
    start,
    end,
    allDay,
    location: str(item.location),
  };
}

export async function fetchCalendarEvents(
  config: CalendarConfig
): Promise<CalendarEvent[]> {
  const now = Date.now();
  if (eventsCache && now - eventsCache.fetchedAt < EVENTS_TTL_MS) {
    return eventsCache.events;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const token = await getAccessToken(config);
      // timeMin = 今月のJST 1日 0時（指示書121・月間グリッドに月初からの過去分が必要）。
      // timeMax は排他的なため「翌月末日23:59」ではなく翌々月1日のJST 0時を渡す
      // （末日終盤開始の予定の取りこぼし防止・意味は同じ）。期間は59〜62日で
      // 従来の60日と実質同水準 → maxResults は 250 のまま（62日×1日4件でも飽和しない）。
      const todayYmd = jstTodayYmd();
      const y = Number(todayYmd.slice(0, 4));
      const m = Number(todayYmd.slice(5, 7));
      const timeMin = `${todayYmd.slice(0, 7)}-01T00:00:00+09:00`;
      const timeMax = `${m >= 11 ? y + 1 : y}-${String(((m + 1) % 12) + 1).padStart(2, "0")}-01T00:00:00+09:00`;
      const params = new URLSearchParams({
        singleEvents: "true", // 繰り返し予定を展開（方式B・院長決定）
        orderBy: "startTime",
        timeMin,
        timeMax,
        maxResults: "250",
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // 404 = カレンダー未共有 or ID誤りが最頻（手順書STEP 5参照）。detailにそのまま出す
        throw new GoogleApiError(
          res.status,
          `予定の取得に失敗しました (HTTP ${res.status}): ${body.slice(0, 300)}`
        );
      }
      const j = (await res.json()) as { items?: unknown };
      const events = (Array.isArray(j.items) ? (j.items as GcalItem[]) : [])
        .map(mapEvent)
        .filter((e): e is CalendarEvent => e !== null);
      eventsCache = { events, fetchedAt: Date.now() };
      return events;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
