// 経歴・入職時の想いの一括削除と削除用パスワード（指示書189）— 純粋部（テスト可能）
//   ハッシュ化・照合はサーバー専用（delete-password-server.ts）。ここには秘密を置かない。

import { HIRING_PROFILE_FIELDS, type HiringProfile } from "./hiring-docs";

/** 削除用パスワードの最短の長さ（B-1） */
export const DELETE_PASSWORD_MIN = 8;
/** 続けて間違えてよい回数（B-3）。これを超えるとロック */
export const DELETE_PASSWORD_LOCK_AFTER = 5;
/** ロックの長さ（分）（B-3） */
export const DELETE_PASSWORD_LOCK_MINUTES = 15;

/** サーバー専用の状態（ハッシュ本体は含めない） */
export type DeletePasswordAttemptState = {
  failCount: number;
  /** ISO。空＝ロックなし */
  lockedUntil: string;
};

export function isLocked(s: DeletePasswordAttemptState, nowIso: string): boolean {
  return !!s.lockedUntil && s.lockedUntil > nowIso;
}

/** 照合結果を受けて次の状態を返す（5回続けて失敗→15分ロック。成功で失敗回数を戻す） */
export function nextAttemptState(s: DeletePasswordAttemptState, ok: boolean, now: Date): DeletePasswordAttemptState {
  if (ok) return { failCount: 0, lockedUntil: "" };
  const failCount = s.failCount + 1;
  if (failCount >= DELETE_PASSWORD_LOCK_AFTER) {
    return { failCount: 0, lockedUntil: new Date(now.getTime() + DELETE_PASSWORD_LOCK_MINUTES * 60_000).toISOString() };
  }
  return { failCount, lockedUntil: "" };
}

/** 残り何回間違えるとロックされるか */
export function attemptsLeft(s: DeletePasswordAttemptState): number {
  return Math.max(0, DELETE_PASSWORD_LOCK_AFTER - s.failCount);
}

export function validateNewDeletePassword(pw: string): string {
  if (typeof pw !== "string" || pw.length < DELETE_PASSWORD_MIN) return `削除用パスワードは${DELETE_PASSWORD_MIN}文字以上にしてください`;
  if (pw.length > 128) return "削除用パスワードが長すぎます（128文字まで）";
  if (/^\s|\s$/.test(pw)) return "先頭・末尾の空白は使えません";
  return "";
}

// ─── 削除される内容の件数（A-3 ②）───

/** 空でない行の数（1欄に複数行あればその行数。1行なら1件） */
export function countLines(v: string): number {
  return v.split(/\r?\n/).filter((l) => l.trim()).length;
}

export type PurgeCounts = {
  /** 項目ごとの件数（学歴・職歴・免許資格・志望動機・自己PR） */
  profile: { key: keyof Omit<HiringProfile, "userId" | "updatedBy" | "updatedAt">; label: string; group: string; count: number }[];
  profileTotal: number;
  /** 採用資料の原本（A-2・既定OFF） */
  docs: number;
  /** スカウターの転記とポイント整理（A-2・既定OFF） */
  scouter: number;
};

export function purgeCountsOf(profile: HiringProfile, docs: number, scouter: number): PurgeCounts {
  const items = HIRING_PROFILE_FIELDS.map((f) => ({ key: f.key, label: f.label, group: f.group, count: countLines(profile[f.key] ?? "") }));
  return { profile: items, profileTotal: items.reduce((a, b) => a + b.count, 0), docs, scouter };
}
