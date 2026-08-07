// メンバーノート（指示書149）— 型・正規化の純関数
//
// 扱うのは「個人情報＋評価的メモ」なので、保護は132（clinic_events）と同じ型に揃える:
//   RLS全拒否テーブル ＋ service-role API 経由のみ ＋ 指定アカウント制（fail-close）。
//
// 146-E（本人が設定する誕生日・入職日）とは**完全に独立**。
// 本人の同意で動くお祝いと、管理側が書く記録を混ぜないため、
// 参照も同期も一切しない（データの出どころを1つに保つ）。

/** テーブル内で設定を持つ行のID（132の __config__ と同じ流儀） */
export const MEMBER_NOTES_CONFIG_ID = "__config__";

export type MemberNote = {
  /** 対象スタッフの userId（1人1件・行IDとして使う） */
  staffUserId: string;
  /** 誕生日 YYYY-MM-DD（カレンダー入力・管理側の記録なので年も持つ） */
  birthday: string;
  /** 入職日 YYYY-MM-DD */
  joinedOn: string;
  /** 強みの記録（自由記述・才/徳/美は入力補助の見出しであって評価項目ではない） */
  strengths: string;
  /** そのほかのメモ（自由記述） */
  memo: string;
  updatedBy: string;
  updatedAt: string;
};

/** 強み欄の入力補助（プレースホルダのみ。ランク・点数は持たせない） */
export const STRENGTH_HINTS = [
  { key: "才", hint: "得意なこと・能力（例: 段取りが早い、説明がわかりやすい）" },
  { key: "徳", hint: "人柄・関わり方（例: 後輩に自然に声をかける）" },
  { key: "美", hint: "所作・佇まい（例: 片付けが行き届いている）" },
] as const;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function normalizeNoteDate(v: unknown): string {
  return typeof v === "string" && DATE_RE.test(v.trim()) ? v.trim() : "";
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export const STRENGTHS_MAX = 4000;
export const MEMO_MAX = 4000;

export function normalizeMemberNote(
  staffUserId: string,
  raw: unknown
): MemberNote | null {
  if (!staffUserId) return null;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    staffUserId,
    birthday: normalizeNoteDate(o.birthday),
    joinedOn: normalizeNoteDate(o.joinedOn),
    strengths: text(o.strengths, STRENGTHS_MAX),
    memo: text(o.memo, MEMO_MAX),
    updatedBy: text(o.updatedBy, 200),
    updatedAt: text(o.updatedAt, 40),
  };
}

/** 中身が全部空なら「未記入」= 保存する意味がない */
export function isEmptyNote(n: MemberNote): boolean {
  return !n.birthday && !n.joinedOn && !n.strengths.trim() && !n.memo.trim();
}

export function emptyNote(staffUserId: string): MemberNote {
  return {
    staffUserId,
    birthday: "",
    joinedOn: "",
    strengths: "",
    memo: "",
    updatedBy: "",
    updatedAt: "",
  };
}
