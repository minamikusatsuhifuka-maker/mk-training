// 記念日のお祝い（指示書146-E）
// 入職記念日と誕生日。どちらも本人が自分のプロフィールで設定し、**本人のホームにだけ**出す。
//
// プライバシー設計（指示書の指定をコードで担保する）:
// - 誕生日は完全なオプトイン（設定しなければ何も起きない）。入職日も任意項目。
// - お祝いは本人にのみ表示。他者の画面・メンバー一覧・staff_profiles_index には一切載せない。
// - 誕生日は「年」を持たない（MM-DD）。年齢が推測される情報を保存しない。
// - 入職日は勤続年数を出すため年を持つ（YYYY-MM-DD）。

/** 入職日: YYYY-MM-DD（年あり） */
const JOINED_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** 誕生日: MM-DD（年なし＝年齢を保存しない） */
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function normalizeJoinedOn(v: unknown): string {
  return typeof v === "string" && JOINED_RE.test(v.trim()) ? v.trim() : "";
}

export function normalizeBirthday(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (BIRTHDAY_RE.test(s)) return s;
  // <input type="date"> は YYYY-MM-DD で返るため、年を落として受け入れる
  if (JOINED_RE.test(s)) return s.slice(5);
  return "";
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export type Celebration =
  | { kind: "birthday"; message: string }
  | { kind: "joined"; message: string; years: number };

/**
 * 今日が記念日かを判定する。該当しなければ空配列。
 * うるう日(02-29)生まれ・入職は、平年は 02-28 に繰り上げて祝う。
 */
export function celebrationsForToday(
  profile: { joinedOn?: string; birthday?: string } | null | undefined,
  now: Date = new Date()
): Celebration[] {
  if (!profile) return [];
  const today = mmdd(now);
  const isLeapYear =
    (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) ||
    now.getFullYear() % 400 === 0;
  const matches = (target: string) =>
    target === today || (!isLeapYear && target === "02-29" && today === "02-28");

  const out: Celebration[] = [];

  const birthday = normalizeBirthday(profile.birthday);
  if (birthday && matches(birthday)) {
    out.push({
      kind: "birthday",
      message: "お誕生日おめでとうございます！",
    });
  }

  const joinedOn = normalizeJoinedOn(profile.joinedOn);
  if (joinedOn && matches(joinedOn.slice(5))) {
    const years = now.getFullYear() - Number(joinedOn.slice(0, 4));
    // 入職当日（0年目）は「記念日」ではないので祝わない
    if (years >= 1) {
      out.push({
        kind: "joined",
        years,
        message: `入職${years}周年おめでとうございます！`,
      });
    }
  }

  return out;
}
