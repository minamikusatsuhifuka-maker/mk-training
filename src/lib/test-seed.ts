// 機能検証用のテストスタッフ（指示書191）— 純粋部
//   検証用の印は Auth の app_metadata.test_seed（本人が書き換えられない領域。166の教訓で user_metadata は使わない）。
//   作成したデータには data.seed191 = true を付け、削除時は「印が付いたアカウントに紐づくもの」だけを対象一覧にしてから消す。

import type { User } from "@supabase/supabase-js";

export const TEST_SEED_FLAG = "test_seed";
export const SEED_MARK = "seed191";
/** 表示用の印 */
export const TEST_SEED_BADGE = "🧪 検証用";

export type TestAccountDef = {
  key: "hanako" | "jiro";
  email: string;
  displayName: string;
  roleId: string;
  grade: "G1" | "G3";
  careerLine: string;
};

/** ログイン用メールは実在しないアドレス（.invalid は RFC 2606 の予約ドメイン） */
export const TEST_ACCOUNTS: readonly TestAccountDef[] = [
  { key: "hanako", email: "test-hanako@mk-training.invalid", displayName: "テスト花子（検証用）", roleId: "看護師", grade: "G1", careerLine: "看護師" },
  { key: "jiro", email: "test-jiro@mk-training.invalid", displayName: "テスト次郎（検証用）", roleId: "マルチタスク医療事務", grade: "G3", careerLine: "マルチタスク医療事務" },
];

export const TEST_PROSPECT_NAME = "テスト三郎（検証用）";

export function isTestSeedUser(u: Pick<User, "app_metadata"> | null | undefined): boolean {
  const app = (u?.app_metadata ?? null) as Record<string, unknown> | null;
  return app?.[TEST_SEED_FLAG] === true;
}

export function isTestSeedEmail(email: string): boolean {
  return TEST_ACCOUNTS.some((a) => a.email === email.toLowerCase());
}

/**
 * 207-1: 育成カルテの担当指定で「検証用」と「実在」が混ざっていないかを調べる（純関数）。
 *
 * - 🧪 検証用の幹部に指定できる担当は 🧪 検証用のスタッフだけ
 * - 実在の幹部に 🧪 検証用のスタッフは指定できない
 * - **名簿に無いidは、検証用の幹部に対しては混在として扱う**
 *   （検証用かどうか確かめられないものを、検証用の枠に入れない）
 *
 * 戻り値は「組み合わせが合わないid」。空配列なら保存してよい。
 * 判定の正本はここ1か所で、APIがこれを呼ぶ（画面の絞り込みは案内のため）。
 */
export function mixedSeedAssignment(
  managerId: string,
  staffIds: readonly string[],
  isTestById: ReadonlyMap<string, boolean>
): string[] {
  const managerIsTest = isTestById.get(managerId) === true;
  return staffIds.filter((id) => (isTestById.get(id) === true) !== managerIsTest);
}

/** 検証用アカウント以外の userId が混ざっていないか（削除の対象一覧の検査） */
export function onlyTestIds(ids: Iterable<string>, testIds: ReadonlySet<string>): { ok: true } | { ok: false; foreign: string[] } {
  const foreign = Array.from(new Set(Array.from(ids).filter((id) => id && !testIds.has(id))));
  return foreign.length === 0 ? { ok: true } : { ok: false, foreign };
}

export const TEST_PASSWORD_MIN = 8;
export function validateTestPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < TEST_PASSWORD_MIN) return `パスワードは${TEST_PASSWORD_MIN}文字以上にしてください`;
  if (pw.length > 72) return "パスワードが長すぎます（72文字まで）";
  return "";
}
