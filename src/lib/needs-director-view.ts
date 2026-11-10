// 🧭 院長は欲求サーベイの資料とデータを見る（指示書277）— 型・文・判定の純関数
//
// 【約束を守る順番】スイッチを ON にした瞬間に、次の3つが同時に起きる（OFF に戻すと3つとも元に戻る）。
//   1. 公開設定の画面の説明文が新しい文になる（directorViewOptions / directorViewProfileNote）
//   2. スタッフ全員にお知らせが出る（確認するまで・ON にした回ごとに1回）
//   3. 院長の「🧭 欲求の一覧」で、公開設定にかかわらず 5つ・15項目と原本が見える（needs-overview-server）
// 【変えないもの】スタッフ同士の見え方・メンバー紹介・可能性ノート（幹部が見る欲求の視点）・カルテは公開設定どおり。
//   「注力」「現況」は ON でもアプリに出さない（原本で確かめる）。
// 【保存】content_store のサーバー専用キー（content-store-policy の SERVER_ONLY_*）。書くのは院長だけ（/api/admin/needs-overview）。
// 依存は needs-survey だけ。

import { SURVEY_VISIBILITY_OPTIONS, type SurveyVisibility } from "./needs-survey";

export const NEEDS_DIRECTOR_VIEW_KEY = "needs_director_view";
export const NEEDS_DIRECTOR_ACK_PREFIX = "needs_director_ack:";
export const needsDirectorAckKey = (userId: string) => `${NEEDS_DIRECTOR_ACK_PREFIX}${userId}`;

/** スイッチの名前（新しい言葉） */
export const NEEDS_DIRECTOR_VIEW_LABEL = "🧭 院長は欲求サーベイの資料とデータを見る";
/** ONにする前に院長に出す文 */
export const NEEDS_DIRECTOR_VIEW_CONFIRM =
  "スタッフに知らせてからONにしてください。ONにすると、公開設定の説明文が変わり、スタッフにお知らせが出ます。";
/** お知らせを閉じるボタン */
export const NEEDS_DIRECTOR_ACK_BUTTON = "確認しました";

export type NeedsDirectorTexts = {
  /** 非公開の説明（今の文と置き換える） */
  privateDesc: string;
  /** レーダーと画像を公開の説明のあとに足す文 */
  publicAdd: string;
  /** 詳細も公開の説明のあとに足す文 */
  detailsAdd: string;
  /** 公開設定の画面の上に出す短い文 */
  banner: string;
  /** スタッフへのお知らせ（改行で段落） */
  notice: string;
};

/** 指示書277 3章・4章の案（院長が管理画面で直せる） */
export const DEFAULT_NEEDS_DIRECTOR_TEXTS: NeedsDirectorTexts = {
  privateDesc: "ほかのスタッフには見えません。院長だけが、あなたの成長を支える面談のために見ます。",
  publicAdd: "院長は、詳細（15項目）と原本も、面談のために見ます。",
  detailsAdd: "院長は、原本も面談のために見ます。",
  banner: "院長は、すべての人の診断結果と原本を、一人ひとりの欲求に配慮した面談と育成のために見ます。ほかの人に見せることはありません。",
  notice: [
    "欲求サーベイの見え方について、お知らせです。",
    "これからは、院長が、皆さんの診断結果（5つの基本的欲求・15項目）と取り込んだ資料を見て、一人ひとりの欲求に配慮した面談と育成に役立てます。",
    "ほかのスタッフへの公開・非公開は、これまでどおり皆さんが選べます。院長がほかの人に見せることはありません。",
  ].join("\n"),
};

export const NEEDS_DIRECTOR_TEXT_FIELDS: { key: keyof NeedsDirectorTexts; label: string; max: number }[] = [
  { key: "privateDesc", label: "非公開の説明（今の文と置き換え）", max: 200 },
  { key: "publicAdd", label: "「レーダーと画像を公開」の説明に足す文", max: 200 },
  { key: "detailsAdd", label: "「詳細も公開」の説明に足す文", max: 200 },
  { key: "banner", label: "公開設定の画面の上に出す文", max: 300 },
  { key: "notice", label: "スタッフへのお知らせ（改行で段落）", max: 1000 },
];

export type NeedsDirectorLog = { at: string; by: string; byName: string; what: "on" | "off" | "texts" };

export type NeedsDirectorViewState = {
  on: boolean;
  /** ONにした日時（お知らせの回の目印にも使う）。一度も ON にしていなければ空 */
  onAt: string;
  offAt: string;
  texts: NeedsDirectorTexts;
  log: NeedsDirectorLog[];
};

const LOG_MAX = 100;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function normalizeNeedsDirectorTexts(raw: unknown): NeedsDirectorTexts {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_NEEDS_DIRECTOR_TEXTS };
  for (const f of NEEDS_DIRECTOR_TEXT_FIELDS) {
    const v = str(o[f.key], f.max).trim();
    if (v) out[f.key] = v;
  }
  return out;
}

/** 壊れた値・未保存は OFF（fail-closed） */
export function normalizeNeedsDirectorView(raw: unknown): NeedsDirectorViewState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const log: NeedsDirectorLog[] = [];
  if (Array.isArray(o.log)) {
    for (const l of o.log) {
      const x = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      const what = x.what === "on" || x.what === "off" || x.what === "texts" ? x.what : null;
      const at = str(x.at, 40);
      if (what && at) log.push({ at, by: str(x.by, 80), byName: str(x.byName, 200), what });
    }
  }
  return {
    on: o.on === true,
    onAt: str(o.onAt, 40),
    offAt: str(o.offAt, 40),
    texts: normalizeNeedsDirectorTexts(o.texts),
    log: log.slice(-LOG_MAX),
  };
}

export function switchNeedsDirectorView(
  s: NeedsDirectorViewState,
  on: boolean,
  actor: { id: string; name: string },
  now: string
): NeedsDirectorViewState {
  if (s.on === on) return s;
  const log = [...s.log, { at: now, by: actor.id, byName: actor.name, what: on ? ("on" as const) : ("off" as const) }].slice(-LOG_MAX);
  return on ? { ...s, on, onAt: now, log } : { ...s, on, offAt: now, log };
}

export function setNeedsDirectorTexts(
  s: NeedsDirectorViewState,
  texts: unknown,
  actor: { id: string; name: string },
  now: string
): NeedsDirectorViewState {
  const log = [...s.log, { at: now, by: actor.id, byName: actor.name, what: "texts" as const }].slice(-LOG_MAX);
  return { ...s, texts: normalizeNeedsDirectorTexts(texts), log };
}

// ─── 確認の記録（1人1行） ───

export type NeedsDirectorAck = { at: string; onAt: string };

export function normalizeNeedsDirectorAck(raw: unknown): NeedsDirectorAck | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at = str(o.at, 40);
  const onAt = str(o.onAt, 40);
  return at && onAt ? { at, onAt } : null;
}

/** 今の回（ON にした日時）を確認したか。OFF の間はお知らせを出さない */
export function hasAckedCurrent(s: Pick<NeedsDirectorViewState, "on" | "onAt">, ack: NeedsDirectorAck | null): boolean {
  if (!s.on) return true;
  return !!ack && ack.onAt === s.onAt;
}

// ─── 公開設定の画面の文 ───

export type VisibilityOption = (typeof SURVEY_VISIBILITY_OPTIONS)[number];

/** ON のときの選択肢の説明（OFF なら今のまま） */
export function directorViewOptions(texts: NeedsDirectorTexts | null): { value: SurveyVisibility; label: string; desc: string }[] {
  if (!texts) return SURVEY_VISIBILITY_OPTIONS.map((o) => ({ ...o }));
  return SURVEY_VISIBILITY_OPTIONS.map((o) => {
    if (o.value === "private") return { ...o, desc: texts.privateDesc };
    if (o.value === "public") return { ...o, desc: `${o.desc}${texts.publicAdd}` };
    return { ...o, desc: `${o.desc}${texts.detailsAdd}` };
  });
}

/** 公開設定の画面の説明の段落の「管理者にも…」の文（OFF は今のまま） */
export const PROFILE_ADMIN_NOTE_OFF = "管理者にも、選んだ設定と同じ範囲だけが見えます。";
export const PROFILE_ADMIN_NOTE_ON = "院長以外の管理者には、選んだ設定と同じ範囲だけが見えます。院長が見る範囲は上のとおりです。";

/** 「注力」「現況」の文（ON のときは原本で院長の目に入ることを書く） */
export const PROFILE_FOCUS_NOTE_OFF = "「注力」「現況」の値は、どの設定でも自分以外には見えません。";
export const PROFILE_FOCUS_NOTE_ON = "「注力」「現況」の値は、どの設定でもアプリの画面には自分以外に出ません（院長は原本で見ることがあります）。";
