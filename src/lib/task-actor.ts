// タスク操作ログの操作者名の解決（指示書56・クライアント専用）
// ログイン中=プロフィール名（display_name→email）／未ログイン=localStorageの名前
// （portal_news_author。お知らせ投稿・リアクションと共用）／未設定=「匿名」。
// 名前入力は強制しない（37Rと同じ思想。匿名でも操作は自由）。

import { getCurrentActorName } from "./news-log";
import { NEWS_AUTHOR_LS_KEY } from "./news-reactions";

export async function resolveTaskActor(): Promise<string> {
  const name = await getCurrentActorName().catch(() => null);
  if (name) return name;
  try {
    const saved = localStorage.getItem(NEWS_AUTHOR_LS_KEY);
    if (saved?.trim()) return saved.trim();
  } catch {
    /* localStorage不可の環境 */
  }
  return "匿名";
}
