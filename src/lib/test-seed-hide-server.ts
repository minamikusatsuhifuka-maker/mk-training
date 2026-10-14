// 検証用アカウントを本物のスタッフ・幹部から隠すときの判定と材料（指示書237）— サーバー専用
//
// 決まり（どの画面・APIでも同じ）：
//   院長（app_metadata.role=admin） → 全部見せる
//   検証用アカウント（app_metadata.test_seed） → 全部見せる
//   それ以外（本物のスタッフ・委任された本物の幹部） → 検証用アカウントとその中身を隠す
// 隠し方の本体は lib/test-seed-hide.ts（純関数）。ここは「誰に隠すか」と「何を隠すか（id と名前）」だけ。

import type { User } from "@supabase/supabase-js";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { loadTestSeedUsers } from "./test-seed-server";
import { serverGetContentRow } from "./content-store-server";
import { staffProfileKey } from "./staff-profiles";
import type { TestSeedHideContext } from "./test-seed-hide";

/** この人には検証用アカウントを隠すか（院長でも検証用でもない＝隠す） */
export function hidesTestSeedFor(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  if (!user) return true;
  return !isAdminUser(user as User) && !isTestSeedUser(user);
}

let cache: { at: number; ctx: TestSeedHideContext } | null = null;
const TTL = 60_000;

/**
 * 隠す材料：検証用アカウントの id と名前（アカウントの表示名・プロフィールの名前）。
 * 取れないときは空（＝何も隠さない。ただし検証用アカウントが無いなら隠す物も無い）。
 */
export async function loadTestSeedHideContext(): Promise<TestSeedHideContext> {
  if (cache && Date.now() - cache.at < TTL) return cache.ctx;
  const { ids, names } = await loadTestSeedUsers();
  const allNames = new Set(names);
  for (const id of ids) {
    try {
      const row = await serverGetContentRow(staffProfileKey(id));
      const n = (row?.data as { name?: unknown } | null)?.name;
      if (typeof n === "string" && n.trim()) allNames.add(n.trim());
    } catch {
      /* 名前が取れなくても id では隠せる */
    }
  }
  const ctx: TestSeedHideContext = { ids, names: allNames };
  cache = { at: Date.now(), ctx };
  return ctx;
}

/** 見る人に合わせた材料（隠さない人には空＝何も外さない） */
export async function hideContextFor(user: Pick<User, "app_metadata"> | null | undefined): Promise<TestSeedHideContext> {
  if (!hidesTestSeedFor(user)) return { ids: new Set(), names: new Set() };
  return loadTestSeedHideContext();
}
