// content_store のサーバー専用アクセス（指示書145）
// service-role で直接読み書きするため RLS 有効後も動く。クライアントから import しないこと。
// 認可（ログイン必須・管理者専用キー）は呼び出し側（/api/content-store）で行う。

import { createSupabaseAdminClient } from "./supabase-admin";

export type ContentRow = { id: string; data: unknown };

export async function serverGetContentRow(
  key: string
): Promise<ContentRow | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("content_store")
      .select("id, data")
      .eq("id", key)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id as string, data: data.data };
  } catch {
    return null;
  }
}

export async function serverGetContentRowsByPrefix(
  prefix: string
): Promise<ContentRow[]> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("content_store")
      .select("id, data")
      .like("id", `${prefix}%`);
    if (error || !data) return [];
    return data.map((r) => ({ id: r.id as string, data: r.data }));
  } catch {
    return [];
  }
}

export async function serverPutContentRow(
  key: string,
  contentType: string,
  data: unknown,
  updatedBy?: string
): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("content_store").upsert({
      id: key,
      content_type: contentType,
      data: data as Record<string, unknown>,
      updated_at: new Date().toISOString(),
      ...(updatedBy ? { updated_by: updatedBy } : {}),
    });
    if (error) {
      console.error("content_store upsert error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("content_store upsert error:", err);
    return false;
  }
}

export async function serverDeleteContentRow(key: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("content_store").delete().eq("id", key);
    if (error) {
      console.error("content_store delete error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("content_store delete error:", err);
    return false;
  }
}
