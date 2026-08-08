// メニューごとの閲覧許可の読み書き（指示書157-B・サーバー専用）
//
// 保存先は content_store の `menu_access` キー（新規テーブルは作らない）。
// content_store は service-role でしか触れないため、ここは必ずサーバーから呼ぶこと。
// 読み取りに失敗したら「未設定」として扱い、呼び出し側が管理者のみに倒す（fail-close）。

import {
  serverGetContentRow,
  serverPutContentRow,
} from "./content-store-server";
import {
  MENU_ACCESS_KEY,
  emptyMenuAccess,
  menuAllowedUserIds,
  normalizeMenuAccess,
  withMenuAllowedUserIds,
  type MenuAccessConfig,
} from "./menu-access";

export async function loadMenuAccess(): Promise<MenuAccessConfig> {
  try {
    const row = await serverGetContentRow(MENU_ACCESS_KEY);
    return row ? normalizeMenuAccess(row.data) : emptyMenuAccess();
  } catch {
    return emptyMenuAccess(); // fail-close（呼び出し側で管理者のみになる）
  }
}

/** そのメニューの指名リスト。未設定なら null */
export async function loadMenuAllowedUserIds(
  menuKey: string
): Promise<string[] | null> {
  return menuAllowedUserIds(await loadMenuAccess(), menuKey);
}

export async function saveMenuAllowedUserIds(
  menuKey: string,
  userIds: string[],
  updatedBy: string
): Promise<boolean> {
  const current = await loadMenuAccess();
  const next = withMenuAllowedUserIds(current, menuKey, userIds);
  return serverPutContentRow(MENU_ACCESS_KEY, "menu_access", next, updatedBy);
}
