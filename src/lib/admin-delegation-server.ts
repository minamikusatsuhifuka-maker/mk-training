// 幹部への委任の読み書きと判定（指示書183・サーバー専用）
//
// 保存先は157の menu_access（content_store のサーバー専用キー）:
//   menus["admin:<項目key>"].allowed_user_ids … その項目を開ける幹部
//   menus["karte:<幹部userId>"].allowed_user_ids … その幹部が見られる担当スタッフ
// 判定の原則: 未設定・失敗・例外はすべて「開けない」（fail-close）。
// **設定の保存は院長（isAdminUser）だけ**（/api/admin/delegation）。ここに幹部が呼べる保存関数は無い。

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { createSupabaseAdminClient } from "./supabase-admin";
import { loadMenuAccess, saveMenuAllowedUserIds } from "./menu-access-server";
import type { MenuAccessConfig } from "./menu-access";
import {
  ADMIN_ITEMS,
  ADMIN_MENU_PREFIX,
  KARTE_MENU_PREFIX,
  adminMenuKey,
  canDelegatedItemsWriteKey,
  findAdminItem,
  karteMenuKey,
} from "./admin-items";

/** アカウントが今も有効か（169と同じ。取得できない・例外・banned_until が未来 → false） */
export async function isActiveAccountId(userId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
    if (!bannedUntil) return true;
    const until = new Date(bannedUntil).getTime();
    if (Number.isNaN(until)) return false;
    return until <= Date.now();
  } catch {
    return false;
  }
}

/** 設定から、その人に委任された項目key（委任できない項目は設定に値があっても無視） */
export function delegatedItemsOf(cfg: MenuAccessConfig, userId: string): string[] {
  const out: string[] = [];
  for (const [menuKey, entry] of Object.entries(cfg.menus)) {
    if (!menuKey.startsWith(ADMIN_MENU_PREFIX)) continue;
    const itemKey = menuKey.slice(ADMIN_MENU_PREFIX.length);
    const item = findAdminItem(itemKey);
    if (!item || !item.delegable) continue; // 🔒の項目は誰にも委任されない
    if (entry.allowed_user_ids.includes(userId)) out.push(itemKey);
  }
  return out;
}

/** 設定から、その幹部の担当スタッフ（自分自身は除く） */
export function karteAssignmentsOf(cfg: MenuAccessConfig, managerUserId: string): string[] {
  const ids = cfg.menus[karteMenuKey(managerUserId)]?.allowed_user_ids ?? [];
  return ids.filter((id) => id !== managerUserId);
}

/** その人に委任された項目key（読み取り失敗は空＝開けない） */
export async function loadDelegatedItems(userId: string): Promise<string[]> {
  try {
    return delegatedItemsOf(await loadMenuAccess(), userId);
  } catch {
    return [];
  }
}

/** その幹部の担当スタッフ（読み取り失敗は空＝見られない） */
export async function loadKarteAssignments(managerUserId: string): Promise<string[]> {
  try {
    return karteAssignmentsOf(await loadMenuAccess(), managerUserId);
  } catch {
    return [];
  }
}

/** 管理者専用キーの書き込みを、その人の委任で通してよいか */
export async function canWriteAdminKeyByDelegation(userId: string, contentKey: string): Promise<boolean> {
  const items = await loadDelegatedItems(userId);
  return canDelegatedItemsWriteKey(items, contentKey);
}

/**
 * 管理者、またはその項目に委任された幹部だけを通す（/api/admin/<項目> 用・requireAdmin の項目版）。
 * 幹部は有効なアカウントであることも確かめる（無効化は即時反映）。
 * 使い方:
 *   const auth = await requireAdminItem("profile-fields");
 *   if (auth.response) return auth.response;
 */
export async function requireAdminItem(itemKey: string): Promise<
  { user: User; isAdmin: boolean; response: null } | { user: null; isAdmin: false; response: NextResponse }
> {
  const { user } = await getSessionUser();
  if (!user) {
    return {
      user: null,
      isAdmin: false,
      response: NextResponse.json({ error: "この操作にはログインが必要です" }, { status: 401 }),
    };
  }
  if (isAdminUser(user)) return { user, isAdmin: true, response: null };
  const item = findAdminItem(itemKey);
  const items = await loadDelegatedItems(user.id);
  if (item?.delegable && items.includes(itemKey) && (await isActiveAccountId(user.id))) {
    return { user, isAdmin: false, response: null };
  }
  // 非管理者には存在を悟らせない（proxy の rewrite と同じ 404 本文）
  return {
    user: null,
    isAdmin: false,
    response: NextResponse.json({ error: "Not Found" }, { status: 404 }),
  };
}

// ─── 保存（院長のみ。呼び出し側のルートで isAdminUser を確かめてから呼ぶ）───

export type DelegationSnapshot = {
  /** 項目key → 指名された幹部 */
  items: Record<string, string[]>;
  /** 幹部userId → 担当スタッフ */
  karte: Record<string, string[]>;
};

export async function loadDelegationSnapshot(): Promise<DelegationSnapshot> {
  const cfg = await loadMenuAccess();
  const items: Record<string, string[]> = {};
  for (const it of ADMIN_ITEMS) {
    if (!it.delegable) continue;
    items[it.key] = cfg.menus[adminMenuKey(it.key)]?.allowed_user_ids ?? [];
  }
  const karte: Record<string, string[]> = {};
  for (const [menuKey, entry] of Object.entries(cfg.menus)) {
    if (!menuKey.startsWith(KARTE_MENU_PREFIX)) continue;
    const managerId = menuKey.slice(KARTE_MENU_PREFIX.length);
    karte[managerId] = entry.allowed_user_ids.filter((id) => id !== managerId);
  }
  return { items, karte };
}

/** 項目の指名を保存（委任できない項目は保存しない＝呼び出し側で弾いてもここでも弾く） */
export async function saveItemDelegation(itemKey: string, userIds: string[], by: string): Promise<boolean> {
  const item = findAdminItem(itemKey);
  if (!item || !item.delegable) return false;
  return saveMenuAllowedUserIds(adminMenuKey(itemKey), userIds, by);
}

/** 担当スタッフの指定を保存（自分自身は除く） */
export async function saveKarteAssignment(managerUserId: string, staffIds: string[], by: string): Promise<boolean> {
  return saveMenuAllowedUserIds(
    karteMenuKey(managerUserId),
    staffIds.filter((id) => id !== managerUserId),
    by
  );
}
