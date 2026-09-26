// 一覧配信時の伏せ処理（指示書146-E）
// /api/content-store の前方一致取得（staff_profile:）は全員分のプロフィールを返すため、
// 「本人にしか見せない項目」は画面で隠すのではなく**サーバーが配信段階で落とす**。
// 画面側の実装ミスやレスポンスの直接閲覧では漏れないようにするため。

import type { ContentRow } from "./content-store-server";
import type { StaffProfile } from "./staff-profiles";
import { redactProfileForViewer } from "./survey-visibility";

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
    // 182: サーベイも渡す前に絞る（164/182 の判定を /api/members 以外の配信経路にも適用する）。
    // ここを通さないと、前方一致取得の応答から非公開のサーベイや注力・現況が読めてしまう
    if ("needsSurvey" in data && typeof data.userId === "string") {
      const redacted = redactProfileForViewer(data as unknown as StaffProfile, requesterUserId);
      delete data.needsSurvey;
      if (redacted.needsSurvey) data.needsSurvey = redacted.needsSurvey;
      changed = true;
    }
    return changed ? { ...row, data } : row;
  });
}
