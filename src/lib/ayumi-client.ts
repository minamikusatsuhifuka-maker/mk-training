"use client";

// 📜 当院の歩み：写真を貼る（指示書253）。下ごしらえは228（お知らせ・イベント）と同じ部品を使う
//   端末で描き直す（位置情報などを消す・HEICはJPEG・長い辺2560pxまで）→ 置き場へ直接送る → サーバーが確かめて付ける

import { prepareNoticeFile } from "./notices-client";
import { getSupabaseBrowserClient } from "./supabase-browser";
import type { AyumiEntry } from "./ayumi";

async function call<T>(input: string, init: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `処理に失敗しました (${res.status})`);
  return j;
}

export async function uploadAyumiPhoto(entryId: string, file: File): Promise<AyumiEntry> {
  const prepared = await prepareNoticeFile(file);
  if (!prepared.mime.startsWith("image/")) throw new Error(`「${file.name}」は写真ではありません（貼れるのは画像だけです）`);
  const slot = await call<{ path: string; token: string; mime: string; bucket: string }>("/api/ayumi/photos", {
    method: "POST",
    body: JSON.stringify({ entryId, name: prepared.name, mime: prepared.mime, size: prepared.blob.size }),
  });
  const { error } = await getSupabaseBrowserClient()
    .storage.from(slot.bucket)
    .uploadToSignedUrl(slot.path, slot.token, prepared.blob, { contentType: slot.mime });
  if (error) throw new Error(`「${prepared.name}」を送れませんでした: ${error.message}`);
  const done = await call<{ entry: AyumiEntry }>("/api/ayumi/photos", {
    method: "PUT",
    body: JSON.stringify({ entryId, path: slot.path, name: prepared.name }),
  });
  return done.entry;
}

export async function removeAyumiPhoto(entryId: string, path: string): Promise<AyumiEntry> {
  return (await call<{ entry: AyumiEntry }>("/api/ayumi/photos", { method: "DELETE", body: JSON.stringify({ entryId, path }) })).entry;
}
