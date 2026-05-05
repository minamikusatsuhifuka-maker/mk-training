// LUMINA ポータル用のSupabaseストレージヘルパ
// content_store の data カラムには { items: [...] } 形式で保存する
// （単一オブジェクト型は { ...data } の直書き）

import { supabase } from "./supabase";
import type { TodayWord } from "@/types/portal";

// 配列型データ取得（items配列を返す。失敗時はdefault）
export async function loadPortalItems<T>(
  key: string,
  defaultItems: T[] = []
): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", key)
      .single();

    if (error || !data) return defaultItems;

    const payload = data.data as { items?: T[] } | null;
    if (!payload || !Array.isArray(payload.items)) return defaultItems;
    return payload.items;
  } catch {
    return defaultItems;
  }
}

// 配列型データ保存
export async function savePortalItems<T>(
  key: string,
  items: T[]
): Promise<boolean> {
  try {
    const { error } = await supabase.from("content_store").upsert({
      id: key,
      content_type: "portal",
      data: { items } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Portal save error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Portal save error:", err);
    return false;
  }
}

// 単一オブジェクト取得（今日の一言など）
export async function loadPortalObject<T>(
  key: string,
  defaultObj: T
): Promise<T> {
  try {
    const { data, error } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", key)
      .single();

    if (error || !data) return defaultObj;
    const payload = data.data as T | null;
    if (!payload) return defaultObj;
    return payload;
  } catch {
    return defaultObj;
  }
}

// 単一オブジェクト保存
export async function savePortalObject<T>(
  key: string,
  obj: T
): Promise<boolean> {
  try {
    const { error } = await supabase.from("content_store").upsert({
      id: key,
      content_type: "portal",
      data: obj as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("Portal save error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Portal save error:", err);
    return false;
  }
}

// よく使う今日の一言の保存形式を厳密化
export async function loadTodayWord(defaultObj: TodayWord): Promise<TodayWord> {
  return loadPortalObject<TodayWord>("portal_today_word", defaultObj);
}

export async function saveTodayWord(obj: TodayWord): Promise<boolean> {
  return savePortalObject<TodayWord>("portal_today_word", obj);
}
