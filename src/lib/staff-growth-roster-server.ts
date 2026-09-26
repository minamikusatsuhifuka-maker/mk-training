// 名簿の軽量読み取り（指示書179・サーバー専用）
// 表示名の解決にだけ使う（userId → 氏名）。プロフィールの中身は返さない。

import { serverGetContentRow } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY } from "./staff-profiles";

export type RosterName = { userId: string; name: string };

export async function loadProfilesIndexServer(): Promise<RosterName[]> {
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((it) => {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        return {
          userId: typeof o.userId === "string" ? o.userId : "",
          name: typeof o.name === "string" ? o.name.trim() : "",
        };
      })
      .filter((e) => e.userId);
  } catch {
    return [];
  }
}
