"use client";

// 📣 お知らせ・イベント（指示書228）— 画面から /api/notices を呼ぶ口と、メニューの印・ホームの知らせの共有
// メニューの印とホームの知らせが同じ数を使うので、1回の画面表示で何度も取りに行かないよう30秒だけ共有する。
// 開いた・答えたら invalidateNoticeSummary() で取り直す（印をすぐ消すため）。

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./supabase-browser";
import {
  NOTICE_IMAGE_MAX_EDGE,
  attachmentKindOf,
  type Notice,
  type NoticeKind,
  type NoticeListItem,
  type NoticeSummary,
  type RsvpStatus,
} from "./notices";

export type NoticesListResponse = {
  notices: NoticeListItem[];
  summary: NoticeSummary;
  today: string;
  isAdmin: boolean;
  testSeed: boolean;
  delegated: boolean;
};

export type RsvpRow = {
  userId: string;
  name: string;
  status: RsvpStatus | "none";
  comment: string;
  answeredAt: string;
  byProxy: boolean;
};

export type NoticeDetailResponse = {
  notice: Notice;
  today: string;
  isMine: boolean;
  canEdit: boolean;
  inAudience: boolean;
  rsvpOpen: boolean;
  canProxy: boolean;
  myRsvp: { status: RsvpStatus; comment: string; answeredAt: string; byProxy: boolean } | null;
  rsvpList: RsvpRow[] | null;
  attendance: { confirmed: boolean; canEdit: boolean; confirmedAt: string } | null;
  fileBucketMissing: boolean;
};

export type AttendanceEditResponse = {
  title: string;
  heldOn: string;
  heldTime: string;
  confirmed: boolean;
  confirmedAt: string;
  candidates: { userId: string; name: string; rsvp: RsvpStatus | "none" }[];
  selected: string[];
};

export class NoticesApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new NoticesApiError(j.error || `読み込めませんでした (${res.status})`, res.status, j.code ?? "");
  return j;
}

export const fetchNoticeList = () => call<NoticesListResponse>("/api/notices");
export const fetchNoticeDetail = (id: string) =>
  call<NoticeDetailResponse>(`/api/notices?id=${encodeURIComponent(id)}`);

export type NoticeFormValue = {
  kind: NoticeKind;
  title: string;
  body: string;
  heldOn: string;
  heldTime: string;
  place: string;
  rsvpDeadline: string;
};

export const createNotice = (v: NoticeFormValue) =>
  call<{ notice: Notice }>("/api/notices", { method: "POST", body: JSON.stringify(v) });
export const updateNotice = (id: string, v: NoticeFormValue) =>
  call<{ notice: Notice }>("/api/notices", { method: "PATCH", body: JSON.stringify({ id, ...v }) });
export const deleteNotice = (id: string) =>
  call<{ ok: true }>(`/api/notices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
export const markNoticeRead = (id: string) =>
  call<{ ok: true }>("/api/notices/read", { method: "POST", body: JSON.stringify({ id }) });
export const sendRsvp = (noticeId: string, status: RsvpStatus, comment: string, userId?: string) =>
  call<{ rsvp: { status: RsvpStatus; comment: string; answeredAt: string; byProxy: boolean } }>("/api/notices/rsvp", {
    method: "PUT",
    body: JSON.stringify({ noticeId, status, comment, ...(userId ? { userId } : {}) }),
  });
export const fetchAttendanceEdit = (noticeId: string) =>
  call<AttendanceEditResponse>(`/api/notices/attendance?noticeId=${encodeURIComponent(noticeId)}`);
export const saveAttendanceEdit = (noticeId: string, userIds: string[]) =>
  call<{ ok: true; confirmedAt: string; count: number }>("/api/notices/attendance", {
    method: "PUT",
    body: JSON.stringify({ noticeId, userIds }),
  });
export const removeNoticeFile = (noticeId: string, path: string) =>
  call<{ notice: Notice }>("/api/notices/files", { method: "DELETE", body: JSON.stringify({ noticeId, path }) });

// ─── 貼るファイルの下ごしらえ（端末の中）───

/**
 * 画像は端末で描き直してから送る（228 §2-2）。
 *   ・描き直すと位置情報などのメタデータは付かない（サーバーでももう一度消す）
 *   ・iPhoneの写真（HEIC）は JPEG にする＝どの端末でも表示できる
 *   ・長い辺を2560pxまでに縮める（向きは写真の情報どおりに直してから描く）
 * PNG は透明を残すため PNG のまま、それ以外は JPEG にする。PDF・Word はそのまま。
 */
export async function prepareNoticeFile(file: File): Promise<{ blob: Blob; name: string; mime: string }> {
  const kind = attachmentKindOf(file.type, file.name);
  if (!kind) throw new Error(`「${file.name}」は貼れない種類です（画像・PDF・Wordだけ）`);
  if (kind === "pdf") return { blob: file, name: file.name, mime: "application/pdf" };
  if (kind === "docx") {
    return { blob: file, name: file.name, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? `「${file.name}」（iPhoneの写真の形式）をこの端末では読み取れませんでした。iPhone・iPadのSafariから貼るか、写真をJPEGで書き出してから貼ってください`
        : `「${file.name}」を画像として読み取れませんでした`
    );
  }
  const scale = Math.min(1, NOTICE_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を描き直せませんでした");
  if (!isPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const mime = isPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.88));
  if (!blob) throw new Error("画像を描き直せませんでした");
  const base = file.name.replace(/\.[^.]+$/, "") || "画像";
  return { blob, name: `${base}.${isPng ? "png" : "jpg"}`, mime };
}

/**
 * 1ファイルを貼る: 送り先をもらう → 置き場へ直接送る → サーバーが確かめて付ける。
 * 返り値は付け終わったお知らせ（見るためのリンクつき）。
 */
export async function uploadNoticeFile(noticeId: string, file: File): Promise<Notice> {
  const prepared = await prepareNoticeFile(file);
  const slot = await call<{ path: string; token: string; mime: string; bucket: string }>("/api/notices/files", {
    method: "POST",
    body: JSON.stringify({ noticeId, name: prepared.name, mime: prepared.mime, size: prepared.blob.size }),
  });
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(slot.bucket)
    .uploadToSignedUrl(slot.path, slot.token, prepared.blob, { contentType: slot.mime });
  if (error) {
    const big = /exceeded|too large|413/i.test(error.message);
    throw new Error(
      big
        ? `「${prepared.name}」は置き場の上限を超えています（いまの上限は院長の設定で決まります）`
        : `「${prepared.name}」を送れませんでした: ${error.message}`
    );
  }
  const done = await call<{ notice: Notice }>("/api/notices/files", {
    method: "PUT",
    body: JSON.stringify({ noticeId, path: slot.path, name: prepared.name }),
  });
  return done.notice;
}

// ─── メニューの印・ホームの知らせ（共有）───

const EMPTY: NoticeSummary = { unread: 0, unanswered: 0, reminders: [] };
const TTL_MS = 30_000;
let cache: { at: number; promise: Promise<NoticeSummary> } | null = null;
const listeners = new Set<(s: NoticeSummary) => void>();

export function fetchNoticeSummary(force = false): Promise<NoticeSummary> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetch("/api/notices?summary=1", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<{ summary?: NoticeSummary }>) : {}))
    .then((j: { summary?: NoticeSummary }) => j.summary ?? EMPTY)
    .catch(() => EMPTY);
  cache = { at: Date.now(), promise };
  return promise;
}

export async function invalidateNoticeSummary(): Promise<void> {
  const s = await fetchNoticeSummary(true);
  for (const fn of listeners) fn(s);
}

/** enabled=false の間は取りに行かない（スイッチOFFの一般スタッフに余計な呼び出しをしない） */
export function useNoticeSummary(enabled = true): NoticeSummary | null {
  const [data, setData] = useState<NoticeSummary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const on = (s: NoticeSummary) => {
      if (alive) setData(s);
    };
    listeners.add(on);
    void fetchNoticeSummary().then(on);
    return () => {
      alive = false;
      listeners.delete(on);
    };
  }, [enabled]);
  return enabled ? data : null;
}
