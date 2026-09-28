// 検証用アカウントの判定（サーバー専用・指示書191 B）
//   一般スタッフの画面に出さないための除外は、ここで app_metadata の印を見て行う。
//   listUsers は重いので60秒だけメモリに持つ（作成・削除の直後は clearTestSeedCache() で捨てる）。

import { createSupabaseAdminClient } from "./supabase-admin";
import { isTestSeedUser } from "./test-seed";

let cache: { at: number; ids: Set<string>; names: Set<string> } | null = null;
const TTL = 60_000;

export function clearTestSeedCache(): void {
  cache = null;
}

/** 検証用アカウントの userId と表示名。判定できないときは空（＝除外しない。作成前は当然空） */
export async function loadTestSeedUsers(): Promise<{ ids: Set<string>; names: Set<string> }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const ids = new Set<string>();
  const names = new Set<string>();
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!error && data?.users) {
      for (const u of data.users) {
        if (!isTestSeedUser(u)) continue;
        ids.add(u.id);
        const meta = u.user_metadata as Record<string, unknown> | null;
        if (typeof meta?.display_name === "string" && meta.display_name.trim()) names.add(meta.display_name.trim());
      }
    }
  } catch {
    /* 空で続ける */
  }
  cache = { at: Date.now(), ids, names };
  return cache;
}

export async function loadTestSeedIds(): Promise<Set<string>> {
  return (await loadTestSeedUsers()).ids;
}
