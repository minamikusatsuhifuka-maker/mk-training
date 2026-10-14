// 📣 お知らせ・イベント（指示書228）— 型・正規化・決まり（純関数・依存なし）
//
// 【置き場所】新しい表は作らない。132 の clinic_events（RLS有効・ポリシー0件＝読み書きはサーバー経由だけ）に
//   record_type を足して同居させる。既存のイベント（132）の読み出しはすべて record_type="event"/"config" で
//   絞っているので、ここで足す種類の行はそちらに出てこない。
//     notice              … お知らせ・イベント1件（1行1件）
//     notice_rsvp         … 出欠（1人1件・id = nrsvp-<お知らせid>-<userId>）
//     notice_read         … 開いた印（1人1件・id = nread-<お知らせid>-<userId>）
//     notice_attendance   … 参加の確定の記録（1イベント1行・id = natt-<お知らせid>）
//     notice_mail_sent    … メールを送った印（本文は残さない）
//
// 【貼ったもの】非公開バケット event-photos の notices/<お知らせid>/ 配下（132-Bの写真は <イベントid>/ 配下で重ならない）。
//   見るときだけ、サーバーが短い時間だけ有効なリンク（署名URL）を出す。DBにリンクは保存しない。
//
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。

export const NOTICE_TYPE = "notice";
export const NOTICE_RSVP_TYPE = "notice_rsvp";
export const NOTICE_READ_TYPE = "notice_read";
export const NOTICE_ATTENDANCE_TYPE = "notice_attendance";
export const NOTICE_MAIL_SENT_TYPE = "notice_mail_sent";

/** このページで使う record_type すべて（検証用データの一括削除・お知らせの削除で使う） */
export const NOTICE_RECORD_TYPES = [
  NOTICE_TYPE,
  NOTICE_RSVP_TYPE,
  NOTICE_READ_TYPE,
  NOTICE_ATTENDANCE_TYPE,
  NOTICE_MAIL_SENT_TYPE,
] as const;

/** 検証用データの一括削除で消した件数の表示名 */
export const NOTICE_PURGE_LABEL: Record<string, string> = {
  notice: "お知らせ・イベント（検証用がつくったもの）",
  notice_rsvp: "イベントの出欠",
  notice_read: "お知らせを開いた印",
  notice_attendance: "イベントの参加の記録",
  notice_attendance_fix: "参加の記録から外した（一般のイベント）",
  notice_mail_sent: "お知らせのメールを送った印",
  notice_files: "お知らせに貼ったファイル（お知らせごと）",
};

/** 貼ったものの置き場（132-B と同じ非公開バケット・接頭辞で分ける） */
export const NOTICE_FILES_PREFIX = "notices";

export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 5000;
export const NOTICE_PLACE_MAX = 100;
export const RSVP_COMMENT_MAX = 100;
/** 1ファイル10MBまで（228 §2-2） */
export const NOTICE_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** 1件に10ファイルまで（228 §2-2） */
export const NOTICE_FILE_MAX_COUNT = 10;
/** 貼ったものを見るためのリンクの有効期間（秒）。「短い時間だけ」＝10分（184の採用資料と同じ） */
export const NOTICE_FILE_SIGN_TTL = 600;
/** 画像は端末で縮めてから送る（長い辺） */
export const NOTICE_IMAGE_MAX_EDGE = 2560;

export type NoticeKind = "notice" | "event";
export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  notice: "お知らせ",
  event: "イベント",
};

export type NoticeAttachmentKind = "image" | "pdf" | "docx";

export type NoticeAttachment = {
  path: string;
  name: string;
  kind: NoticeAttachmentKind;
  mime: string;
  size: number;
  uploadedAt: string;
  /** 見るためのリンク（GETのときだけサーバーが付ける・保存しない） */
  url?: string;
};

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** イベントの開催日 "YYYY-MM-DD"（お知らせは空） */
  heldOn: string;
  /** 開催の時刻 "HH:MM"（空＝時刻なし） */
  heldTime: string;
  place: string;
  /** 出欠の締切 "YYYY-MM-DD"（この日の終わりまで回答できる） */
  rsvpDeadline: string;
  attachments: NoticeAttachment[];
  authorId: string;
  authorName: string;
  /** 検証用アカウントがつくった（一般スタッフには出さない・一括削除の対象） */
  testSeed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RsvpStatus = "yes" | "no";
export const RSVP_LABEL: Record<RsvpStatus | "none", string> = {
  yes: "出席",
  no: "欠席",
  none: "未回答",
};

export type NoticeRsvp = {
  noticeId: string;
  userId: string;
  status: RsvpStatus;
  comment: string;
  answeredAt: string;
  /** 代わりに直した人（本人が答えたときは空） */
  byUserId: string;
};

export type NoticeAttendance = {
  noticeId: string;
  /** お知らせが消えても記録が読めるように、確定したときの題名・日時を写しておく */
  title: string;
  heldOn: string;
  heldTime: string;
  userIds: string[];
  /** 確定したときの氏名の控え（名簿から引けないときに使う） */
  names: Record<string, string>;
  testSeed: boolean;
  confirmedAt: string;
  confirmedBy: string;
  updatedAt: string;
  updatedBy: string;
};

// ─── 行id ───

export function genNoticeId(now = Date.now(), rand = Math.random()): string {
  return `ntc-${now}-${rand.toString(36).slice(2, 8)}`;
}
export function rsvpRowId(noticeId: string, userId: string): string {
  return `nrsvp-${noticeId}-${userId}`;
}
export function readRowId(noticeId: string, userId: string): string {
  return `nread-${noticeId}-${userId}`;
}
export function attendanceRowId(noticeId: string): string {
  return `natt-${noticeId}`;
}
/** 締切前の知らせのメールを送った印（同じ人・同じ段・同じ締切で2回送らない） */
export function reminderSentRowId(noticeId: string, stage: ReminderStage, deadline: string, userId: string): string {
  return `nsent-${noticeId}-${stage}-${deadline.replaceAll("-", "")}-${userId}`;
}
/** 新しいお知らせのメールを送った印（1件に1行・宛先ごとの記録は持たない） */
export function newMailSentRowId(noticeId: string): string {
  return `nsent-${noticeId}-new`;
}

const NOTICE_ID_RE = /^ntc-\d{10,}-[a-z0-9]{1,8}$/;
export function isNoticeId(v: unknown): v is string {
  return typeof v === "string" && NOTICE_ID_RE.test(v);
}

// ─── 日付（すべて日本時間の "YYYY-MM-DD"）───

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

export function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(t)) return "";
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** 出欠の締切の初期値＝開催日の前日（228 §2-2） */
export function defaultRsvpDeadline(heldOn: string): string {
  return isYmd(heldOn) ? addDaysYmd(heldOn, -1) : "";
}

/** 日本時間の今日 */
export function jstToday(nowMs = Date.now()): string {
  return new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
}

/** 開催日時（日本時間）を過ぎたか。時刻が無いときは開催日の0時から */
export function eventStarted(n: Pick<Notice, "heldOn" | "heldTime">, nowMs = Date.now()): boolean {
  if (!isYmd(n.heldOn)) return false;
  const hm = HM_RE.test(n.heldTime) ? n.heldTime : "00:00";
  const start = Date.parse(`${n.heldOn}T${hm}:00+09:00`);
  return !Number.isNaN(start) && nowMs >= start;
}

/** 本人が出欠を送れる・変えられるか（締切日の終わりまで） */
export function isRsvpOpen(n: Pick<Notice, "kind" | "rsvpDeadline">, today: string): boolean {
  return n.kind === "event" && isYmd(n.rsvpDeadline) && today <= n.rsvpDeadline;
}

/** 締切前の知らせの段（228 §5: 3日前と前日） */
export type ReminderStage = "d3" | "d1";
export const REMINDER_STAGE_LABEL: Record<ReminderStage, string> = { d3: "締切の3日前", d1: "締切の前日" };

/** 今日がメールを送る日か（その日だけ。さかのぼって送らない） */
export function reminderStageFor(n: Pick<Notice, "kind" | "rsvpDeadline">, today: string): ReminderStage | null {
  if (n.kind !== "event" || !isYmd(n.rsvpDeadline)) return null;
  if (today === addDaysYmd(n.rsvpDeadline, -3)) return "d3";
  if (today === addDaysYmd(n.rsvpDeadline, -1)) return "d1";
  return null;
}

/** アプリ内の知らせを出す期間（締切の3日前から締切日まで・未回答の間ずっと） */
export function inReminderWindow(n: Pick<Notice, "kind" | "rsvpDeadline">, today: string): boolean {
  return isRsvpOpen(n, today) && today >= addDaysYmd(n.rsvpDeadline, -3);
}

// ─── 締切の色分け（指示書230 §1）───

/** 締切までの日数（日本時間の日付で数える。当日=0・前日=1・過ぎた=負） */
export function deadlineDaysLeft(deadline: string, today: string): number | null {
  if (!isYmd(deadline) || !isYmd(today)) return null;
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** 色の段（8日以上=緑／7〜2日=オレンジ／前日〜当日=赤／過ぎた=灰） */
export type DeadlineTone = "green" | "orange" | "red" | "past";

export function deadlineTone(daysLeft: number): DeadlineTone {
  if (daysLeft < 0) return "past";
  if (daysLeft <= 1) return "red";
  if (daysLeft <= 7) return "orange";
  return "green";
}

/** 色だけに頼らない文字（「あと○日」） */
export function deadlineLeftText(daysLeft: number): string {
  if (daysLeft < 0) return "締切を過ぎました";
  if (daysLeft === 0) return "今日が締切";
  return `あと${daysLeft}日`;
}

/** 締切3日前からの帯の文（230 §2） */
export function rsvpAlertText(title: string, deadline: string): string {
  return `${title}の出欠が、まだです。締切は${formatYmdJp(deadline)}です。`;
}

/** "2026-10-20" → "10月20日（火）" */
export function formatYmdJp(ymd: string): string {
  if (!isYmd(ymd)) return "";
  const d = new Date(`${ymd}T00:00:00Z`);
  const w = "日月火水木金土"[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）`;
}

export function formatHeld(n: Pick<Notice, "heldOn" | "heldTime">): string {
  const d = formatYmdJp(n.heldOn);
  if (!d) return "";
  return n.heldTime ? `${d} ${n.heldTime}` : d;
}

// ─── 正規化 ───

function str(v: unknown, max = 10000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function attachmentKind(v: unknown): NoticeAttachmentKind | null {
  return v === "image" || v === "pdf" || v === "docx" ? v : null;
}

export function normalizeAttachments(input: unknown): NoticeAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: NoticeAttachment[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const path = str(o.path, 300);
    const kind = attachmentKind(o.kind);
    if (!path || !kind || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: str(o.name, 200) || "ファイル",
      kind,
      mime: str(o.mime, 100),
      size: typeof o.size === "number" && o.size >= 0 ? Math.floor(o.size) : 0,
      uploadedAt: str(o.uploadedAt, 40),
      // url は保存しない（GETのときだけ付ける）
    });
  }
  return out.slice(0, NOTICE_FILE_MAX_COUNT);
}

export function normalizeNotice(id: string, raw: unknown): Notice | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind: NoticeKind = o.kind === "event" ? "event" : "notice";
  const title = str(o.title, NOTICE_TITLE_MAX).trim();
  if (!title) return null;
  const heldOn = kind === "event" && isYmd(o.heldOn) ? (o.heldOn as string) : "";
  if (kind === "event" && !heldOn) return null;
  const createdAt = str(o.createdAt, 40) || new Date(0).toISOString();
  return {
    id,
    kind,
    title,
    body: str(o.body, NOTICE_BODY_MAX),
    heldOn,
    heldTime: kind === "event" && typeof o.heldTime === "string" && HM_RE.test(o.heldTime) ? o.heldTime : "",
    place: kind === "event" ? str(o.place, NOTICE_PLACE_MAX) : "",
    rsvpDeadline: kind === "event" && isYmd(o.rsvpDeadline) ? (o.rsvpDeadline as string) : kind === "event" ? defaultRsvpDeadline(heldOn) : "",
    attachments: normalizeAttachments(o.attachments),
    authorId: str(o.authorId, 64),
    authorName: str(o.authorName, 60),
    testSeed: o.testSeed === true,
    createdAt,
    updatedAt: str(o.updatedAt, 40) || createdAt,
  };
}

export function normalizeRsvp(raw: unknown): NoticeRsvp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = o.status === "yes" || o.status === "no" ? o.status : null;
  const noticeId = str(o.noticeId, 64);
  const userId = str(o.userId, 64);
  if (!status || !noticeId || !userId) return null;
  return {
    noticeId,
    userId,
    status,
    comment: str(o.comment, RSVP_COMMENT_MAX),
    answeredAt: str(o.answeredAt, 40),
    byUserId: str(o.byUserId, 64),
  };
}

export function normalizeAttendance(raw: unknown): NoticeAttendance | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const noticeId = str(o.noticeId, 64);
  if (!noticeId) return null;
  const userIds = Array.isArray(o.userIds)
    ? Array.from(new Set(o.userIds.filter((x): x is string => typeof x === "string" && x !== "")))
    : [];
  const names: Record<string, string> = {};
  if (o.names && typeof o.names === "object") {
    for (const [k, v] of Object.entries(o.names as Record<string, unknown>)) {
      if (typeof v === "string") names[k] = v.slice(0, 60);
    }
  }
  return {
    noticeId,
    title: str(o.title, NOTICE_TITLE_MAX),
    heldOn: isYmd(o.heldOn) ? (o.heldOn as string) : "",
    heldTime: typeof o.heldTime === "string" && HM_RE.test(o.heldTime) ? o.heldTime : "",
    userIds,
    names,
    testSeed: o.testSeed === true,
    confirmedAt: str(o.confirmedAt, 40),
    confirmedBy: str(o.confirmedBy, 64),
    updatedAt: str(o.updatedAt, 40),
    updatedBy: str(o.updatedBy, 64),
  };
}

/** 新しい順（つくった日時の降順） */
export function sortNotices(list: Notice[]): Notice[] {
  return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

// ─── 入力の確かめ（作成・編集）───

export type NoticeInput = {
  kind: NoticeKind;
  title: string;
  body: string;
  heldOn: string;
  heldTime: string;
  place: string;
  rsvpDeadline: string;
};

export function validateNoticeInput(raw: unknown): { ok: true; value: NoticeInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "入力が読み取れません" };
  const o = raw as Record<string, unknown>;
  const kind: NoticeKind = o.kind === "event" ? "event" : "notice";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return { ok: false, error: "題名を入れてください" };
  if (title.length > NOTICE_TITLE_MAX) return { ok: false, error: `題名は${NOTICE_TITLE_MAX}字までです` };
  const body = typeof o.body === "string" ? o.body : "";
  if (body.length > NOTICE_BODY_MAX) return { ok: false, error: `本文は${NOTICE_BODY_MAX}字までです` };
  if (kind === "notice") {
    return { ok: true, value: { kind, title, body, heldOn: "", heldTime: "", place: "", rsvpDeadline: "" } };
  }
  const heldOn = typeof o.heldOn === "string" ? o.heldOn : "";
  if (!isYmd(heldOn)) return { ok: false, error: "開催日を入れてください" };
  const heldTime = typeof o.heldTime === "string" ? o.heldTime : "";
  if (heldTime && !HM_RE.test(heldTime)) return { ok: false, error: "開催の時刻が読み取れません" };
  const place = typeof o.place === "string" ? o.place.trim() : "";
  if (place.length > NOTICE_PLACE_MAX) return { ok: false, error: `場所は${NOTICE_PLACE_MAX}字までです` };
  const rawDeadline = typeof o.rsvpDeadline === "string" ? o.rsvpDeadline : "";
  const rsvpDeadline = rawDeadline ? rawDeadline : defaultRsvpDeadline(heldOn);
  if (!isYmd(rsvpDeadline)) return { ok: false, error: "出欠の締切が読み取れません" };
  if (rsvpDeadline > heldOn) return { ok: false, error: "出欠の締切は開催日までの日にしてください" };
  return { ok: true, value: { kind, title, body, heldOn, heldTime, place, rsvpDeadline } };
}

export function validateRsvpComment(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.slice(0, RSVP_COMMENT_MAX);
}

// ─── 貼れるもの ───

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 端末から選んだファイルの種類（拡張子と申告の型から。中身の確認はサーバーが別に行う） */
export function attachmentKindOf(mime: string, name: string): NoticeAttachmentKind | null {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(m)) return "image";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext) && (m === "" || m.startsWith("image/") || m === "application/octet-stream")) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m === DOCX_MIME || ext === "docx") return "docx";
  return null;
}

/** 保存してよい型（画像は端末で JPEG/PNG/WebP にしてから送る＝HEICのままは置かない） */
export function storedMimeFor(kind: NoticeAttachmentKind, mime: string): string | null {
  if (kind === "image") return ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : null;
  if (kind === "pdf") return "application/pdf";
  return DOCX_MIME;
}

export function extFor(kind: NoticeAttachmentKind, mime: string): string {
  if (kind === "pdf") return "pdf";
  if (kind === "docx") return "docx";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** 中身の先頭から本当の種類を見る（拡張子の付け替えを通さない）。234 で lib/file-sniff.ts に移して共通にした */
export { sniffFileType, type SniffedType } from "./file-sniff";
import type { SniffedType } from "./file-sniff";

/** 中身と申告が合っているか */
export function sniffMatches(kind: NoticeAttachmentKind, mime: string, sniffed: SniffedType): boolean {
  if (kind === "pdf") return sniffed === "pdf";
  if (kind === "docx") return sniffed === "zip";
  if (mime === "image/jpeg") return sniffed === "jpeg";
  if (mime === "image/png") return sniffed === "png";
  if (mime === "image/webp") return sniffed === "webp";
  return false;
}

/** 置き場のパス（notices/<お知らせid>/<時刻>-<乱数>.<拡張子>）。元のファイル名はパスに入れない */
export function noticeFilePath(noticeId: string, ext: string, now = Date.now(), rand = Math.random()): string {
  return `${NOTICE_FILES_PREFIX}/${noticeId}/${now}-${rand.toString(36).slice(2, 10)}.${ext}`;
}

export function isNoticeFilePath(noticeId: string, path: string): boolean {
  const prefix = `${NOTICE_FILES_PREFIX}/${noticeId}/`;
  return path.startsWith(prefix) && /^[0-9]+-[a-z0-9]+\.(jpg|png|webp|pdf|docx)$/.test(path.slice(prefix.length));
}

/** 画面に出すファイル名（パスの区切りや制御文字を落とす） */
export function safeFileName(name: string): string {
  const s = (name || "").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
  return (s || "ファイル").slice(0, 120);
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

// ─── 一覧の印（未読・未回答）───

export type NoticeListItem = Omit<Notice, "attachments"> & {
  attachmentCount: number;
  imageCount: number;
  read: boolean;
  myRsvp: RsvpStatus | null;
  /** 自分が出欠をとる相手か（検証用のイベントは検証用アカウントだけ） */
  inAudience: boolean;
  rsvpOpen: boolean;
  isMine: boolean;
  canEdit: boolean;
};

export type NoticeSummary = {
  unread: number;
  unanswered: number;
  /** 締切の3日前〜締切日で、まだ答えていないイベント（ホームの知らせ） */
  reminders: { id: string; title: string; rsvpDeadline: string; daysLeft: number }[];
};

export function summarizeNotices(items: NoticeListItem[], today: string): NoticeSummary {
  let unread = 0;
  let unanswered = 0;
  const reminders: NoticeSummary["reminders"] = [];
  for (const n of items) {
    if (!n.read && !n.isMine) unread += 1;
    if (n.kind === "event" && n.inAudience && n.rsvpOpen && !n.myRsvp) {
      unanswered += 1;
      if (inReminderWindow(n, today)) {
        reminders.push({ id: n.id, title: n.title, rsvpDeadline: n.rsvpDeadline, daysLeft: deadlineDaysLeft(n.rsvpDeadline, today) ?? 0 });
      }
    }
  }
  reminders.sort((a, b) => a.rsvpDeadline.localeCompare(b.rsvpDeadline));
  return { unread, unanswered, reminders };
}

// ─── 参加の記録（管理画面）───

export type AttendanceRecordView = {
  noticeId: string;
  title: string;
  heldOn: string;
  heldTime: string;
  participants: { userId: string; name: string }[];
  testSeed: boolean;
  confirmedAt: string;
  /** お知らせが残っているか（消されていても記録は残る） */
  noticeExists: boolean;
};

/** 期間で絞る（開催日で見る・両端を含む・空は制限なし） */
export function filterByPeriod<T extends { heldOn: string }>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => (!from || r.heldOn >= from) && (!to || r.heldOn <= to));
}

/** 人ごとの見方（いつ・どのイベントに参加したか） */
export function attendanceByPerson(
  rows: AttendanceRecordView[]
): { userId: string; name: string; events: { noticeId: string; title: string; heldOn: string; heldTime: string }[] }[] {
  const map = new Map<string, { userId: string; name: string; events: { noticeId: string; title: string; heldOn: string; heldTime: string }[] }>();
  for (const r of rows) {
    for (const p of r.participants) {
      const cur = map.get(p.userId) ?? { userId: p.userId, name: p.name, events: [] };
      cur.events.push({ noticeId: r.noticeId, title: r.title, heldOn: r.heldOn, heldTime: r.heldTime });
      map.set(p.userId, cur);
    }
  }
  const out = Array.from(map.values());
  for (const p of out) p.events.sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  out.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return out;
}

function csvCell(v: string): string {
  const s = v ?? "";
  // 表計算ソフトで式として読まれないように先頭の = + - @ を無害化する
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV（1行=1人×1イベント）。Excelで文字化けしないよう先頭にBOMを付けるのは画面側 */
export function attendanceCsv(rows: AttendanceRecordView[]): string {
  const lines = [["開催日", "時刻", "イベント", "参加した人"].map(csvCell).join(",")];
  const sorted = rows.slice().sort((a, b) => a.heldOn.localeCompare(b.heldOn) || a.title.localeCompare(b.title, "ja"));
  for (const r of sorted) {
    for (const p of r.participants) {
      lines.push([r.heldOn, r.heldTime, r.title, p.name].map(csvCell).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}
