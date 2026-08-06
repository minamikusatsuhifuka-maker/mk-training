// content_store への唯一の実アクセス経路（指示書145）
// ブラウザからは認証必須API（/api/content-store）、サーバー（API route 等）からは
// service-role で直接。呼び出し側は環境を意識しなくてよい。
//
// これ以降、アプリのどこからも anon キーで content_store を触らないこと。

import type { ContentRow } from "./content-store-server";

const isServer = typeof window === "undefined";

// サーバー実行時のみ service-role 実装を読み込む（クライアントバンドルでは呼ばれない）
async function server() {
  return import("./content-store-server");
}

export async function getContentRow(key: string): Promise<ContentRow | null> {
  if (isServer) return (await server()).serverGetContentRow(key);
  try {
    const res = await fetch(
      `/api/content-store?key=${encodeURIComponent(key)}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { row?: ContentRow | null };
    return json.row ?? null;
  } catch {
    return null;
  }
}

export async function getContentRowsByPrefix(
  prefix: string
): Promise<ContentRow[]> {
  if (isServer) return (await server()).serverGetContentRowsByPrefix(prefix);
  try {
    const res = await fetch(
      `/api/content-store?prefix=${encodeURIComponent(prefix)}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { rows?: ContentRow[] };
    return json.rows ?? [];
  } catch {
    return [];
  }
}

export async function putContentRow(
  key: string,
  contentType: string,
  data: unknown
): Promise<boolean> {
  if (isServer) {
    return (await server()).serverPutContentRow(key, contentType, data);
  }
  try {
    const res = await fetch("/api/content-store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ key, contentType, data }),
    });
    return res.ok;
  } catch (err) {
    console.error("content_store save error:", err);
    return false;
  }
}

export async function deleteContentRow(key: string): Promise<boolean> {
  if (isServer) return (await server()).serverDeleteContentRow(key);
  try {
    const res = await fetch("/api/content-store", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ key }),
    });
    return res.ok;
  } catch (err) {
    console.error("content_store delete error:", err);
    return false;
  }
}
