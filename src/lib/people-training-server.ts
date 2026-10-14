// 人材育成研修を見られるか・受講者を指定できるか（サーバー専用）
//
// 【院長を見分ける】このアプリでは管理者（app_metadata.role === "admin"）を院長として扱ってきたが、
//   人材育成研修では「院長」と「ほかの管理者」を分ける（院長の決定・2026-10-15）。
//   院長のアカウントは環境変数 DIRECTOR_USER_ID（Supabase の User UID）で決める。コードには書かない。
//   未設定・一致しない → 院長ではない（fail-closed：設定が入るまでは院長も研修を見られない・受講者を指定できない）。
// 【見られる人】院長と、受講者に指定された人（「⚙ 委任」で人材育成研修を任された人）。ほかの管理者は、指定されていなければ見られない。

import type { User } from "@supabase/supabase-js";
import { isAdminUser } from "./admin-role";
import { loadDelegatedItems } from "./admin-delegation-server";
import { PEOPLE_TRAINING_ITEM_KEY } from "./admin-items";

export const DIRECTOR_USER_ID_ENV = "DIRECTOR_USER_ID";

/** 院長か（管理者であって、かつ DIRECTOR_USER_ID と一致する） */
export function isDirectorUser(user: User | null | undefined): boolean {
  const id = (process.env.DIRECTOR_USER_ID ?? "").trim();
  return !!user && !!id && user.id === id && isAdminUser(user);
}

/** requireAdminItem("people-training") を通った人のうち、研修を見られる人 */
export async function canSeePeopleTraining(auth: { user: User; isAdmin: boolean }): Promise<boolean> {
  // 管理者でない人は、requireAdminItem が「受講者に指定されている」ことを確かめ済み
  if (!auth.isAdmin) return true;
  if (isDirectorUser(auth.user)) return true;
  // ほかの管理者は、受講者に指定されていれば見られる
  return (await loadDelegatedItems(auth.user.id)).includes(PEOPLE_TRAINING_ITEM_KEY);
}
