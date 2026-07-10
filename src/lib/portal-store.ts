// 南草津皮フ科 ポータル用のSupabaseストレージヘルパ
// content_store の data カラムには { items: [...] } 形式で保存する
// （単一オブジェクト型は { ...data } の直書き）

import { supabase } from "./supabase";
import type {
  ArchivedNewsItem,
  CharacterSettings,
  NewsItem,
  NewsLogEntry,
  NewsLogInput,
  TodayWord,
} from "@/types/portal";
import {
  CHARACTER_SETTINGS_KEY,
  DEFAULT_CHARACTER_SETTINGS,
  NEWS_LOG_KEY,
  NEWS_LOG_MAX,
  PORTAL_KEYS,
  isNewsExpired,
} from "@/types/portal";

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

// ─── キャラクター通知設定 ───
// 既存データに新フィールドが無い場合に備えてデフォルトとマージする
export async function loadCharacterSettings(): Promise<CharacterSettings> {
  const obj = await loadPortalObject<Partial<CharacterSettings>>(
    CHARACTER_SETTINGS_KEY,
    {}
  );
  return { ...DEFAULT_CHARACTER_SETTINGS, ...obj };
}

export async function saveCharacterSettings(
  settings: CharacterSettings
): Promise<boolean> {
  return savePortalObject<CharacterSettings>(CHARACTER_SETTINGS_KEY, settings);
}

// ─── お知らせ操作ログ（portal_news_log） ───
// 作成/更新/削除/アーカイブ/復元のすべての導線から呼ぶ（指示書36）。
// 最新が先頭。NEWS_LOG_MAX 件で切り詰め（古いものから削除）。
// ログ失敗はお知らせ本体の保存を妨げない（呼び出し側で catch する）。
export async function appendNewsLog(
  input: NewsLogInput | NewsLogInput[]
): Promise<boolean> {
  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) return true;
  const now = Date.now();
  const entries: NewsLogEntry[] = inputs.map((e, i) => ({
    ...e,
    id: `nlog_${now}_${i}`,
    at: new Date().toISOString(),
  }));
  const current = await loadPortalItems<NewsLogEntry>(NEWS_LOG_KEY, []);
  return savePortalItems(
    NEWS_LOG_KEY,
    [...entries, ...current].slice(0, NEWS_LOG_MAX)
  );
}

export async function loadNewsLog(): Promise<NewsLogEntry[]> {
  return loadPortalItems<NewsLogEntry>(NEWS_LOG_KEY, []);
}

// ─── 期限切れお知らせのアーカイブ化 ───
// portal_news の期限切れ項目を portal_news_archive へ移動し、portal_news から除去する。
// 既にアーカイブ済みのIDは二重追加しない（冪等）。管理画面の読み込み時にのみ呼ぶこと。
export async function archiveExpiredNews(): Promise<number> {
  const [news, archive, charSettings] = await Promise.all([
    loadPortalItems<NewsItem>(PORTAL_KEYS.news, []),
    loadPortalItems<ArchivedNewsItem>(PORTAL_KEYS.newsArchive, []),
    loadCharacterSettings(),
  ]);

  const now = Date.now();
  const days = charSettings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
  const expired = news.filter((n) => isNewsExpired(n, days, now));
  if (expired.length === 0) return 0;

  const archivedIds = new Set(archive.map((a) => a.id));
  const newlyArchived: ArchivedNewsItem[] = expired
    .filter((n) => !archivedIds.has(n.id))
    .map((n) => ({ ...n, archivedAt: new Date().toISOString() }));
  const remainingNews = news.filter((n) => !expired.some((e) => e.id === n.id));

  const [okNews, okArchive] = await Promise.all([
    savePortalItems(PORTAL_KEYS.news, remainingNews),
    newlyArchived.length > 0
      ? savePortalItems(PORTAL_KEYS.newsArchive, [...archive, ...newlyArchived])
      : Promise.resolve(true),
  ]);
  if (okNews && okArchive && newlyArchived.length > 0) {
    await appendNewsLog(
      newlyArchived.map((n) => ({
        action: "archive" as const,
        newsId: n.id,
        newsTitle: n.title,
        actor: "自動（期限切れ）",
        source: "admin" as const,
      }))
    ).catch(() => {});
  }
  return okNews && okArchive ? newlyArchived.length : 0;
}
