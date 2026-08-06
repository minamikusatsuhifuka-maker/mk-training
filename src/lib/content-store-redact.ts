// 一覧配信時の伏せ処理（指示書146-E）
// /api/content-store の前方一致取得（staff_profile:）は全員分のプロフィールを返すため、
// 「本人にしか見せない項目」は画面で隠すのではなく**サーバーが配信段階で落とす**。
// 画面側の実装ミスやレスポンスの直接閲覧では漏れないようにするため。

import type { ContentRow } from "./content-store-server";

/** 本人以外には渡さないプロフィール項目 */
const OWNER_ONLY_PROFILE_FIELDS = ["joinedOn", "birthday"] as const;

export function redactForeignProfileRows(
  rows: ContentRow[],
  requesterUserId: string
): ContentRow[] {
  const ownRowId = `staff_profile:${requesterUserId}`;
  return rows.map((row) => {
    if (row.id === ownRowId) return row;
    if (!row.data || typeof row.data !== "object") return row;
    const data = { ...(row.data as Record<string, unknown>) };
    let changed = false;
    for (const f of OWNER_ONLY_PROFILE_FIELDS) {
      if (f in data) {
        delete data[f];
        changed = true;
      }
    }
    return changed ? { ...row, data } : row;
  });
}
