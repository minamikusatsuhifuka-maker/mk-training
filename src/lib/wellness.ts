// 1on1の「ウェルネスの視点」（指示書 mk_training_karte_wellness_1on1）— 純関数・文言の正本
//
// 【何をするか】1on1で、スタッフの「豊かで幸せ」をウェルネスの8つの面で聴き、
//   「話した面（タグ）」と「本人の言葉のメモ」だけを残す。**点数・評価・段階は持たない**。
//   等級・七つの実の評価とは切り離す（評価・等級・AI院長・書き出しにこのデータを流さない）。
//
// 【見られる人】院長＝全スタッフ分／担当に指定された幹部＝担当スタッフ分だけ。
//   **スタッフ本人には見せない**（わたしの可能性ノートに出さない）。判定はサーバー
//   （/api/growth/wellness・staff-growth-server の canViewStaff）だけで行う。
//
// 【置き場所】新しい表もSQLも足さない。可能性ノートの表 clinic_staff_growth
//   （RLS有効・ポリシー0＝外からの直接アクセスは全拒否・service-role のみ）に
//   record_type = "wellness" で1回分＝1行。誰のことかは data.userId。
//
// "@/" を使わない（node --experimental-strip-types で直接確かめられるように）。

/** 8つの面。**並びと英語キーを変えない**（保存はキーで行い、表示のたびに日本語を引く） */
export const WELLNESS_KEYS = [
  "physical",
  "emotional",
  "intellectual",
  "occupational",
  "social",
  "environmental",
  "financial",
  "spiritual",
] as const;

export type WellnessKey = (typeof WELLNESS_KEYS)[number];

export const WELLNESS_LABELS: Record<WellnessKey, string> = {
  physical: "身体",
  emotional: "感情",
  intellectual: "知性",
  occupational: "職業",
  social: "社会",
  environmental: "環境",
  financial: "金銭",
  spiritual: "精神",
};

export function isWellnessKey(v: unknown): v is WellnessKey {
  return typeof v === "string" && (WELLNESS_KEYS as readonly string[]).includes(v);
}

/** 実在のキーだけ・定義の順・重複なし（クライアントやAIの値を信じない） */
export function normalizeWellnessTags(raw: unknown): WellnessKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter(isWellnessKey));
  return WELLNESS_KEYS.filter((k) => set.has(k));
}

export const WELLNESS_NOTE_MAX = 2000;

/** メモは選んだ面の分だけ残す（外した面のメモは捨てる）。空のメモは持たない */
export function normalizeWellnessNotes(
  raw: unknown,
  tags: readonly WellnessKey[]
): Partial<Record<WellnessKey, string>> {
  const out: Partial<Record<WellnessKey, string>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const k of tags) {
    const v = o[k];
    if (typeof v !== "string") continue;
    const s = v.slice(0, WELLNESS_NOTE_MAX);
    if (s.trim()) out[k] = s;
  }
  return out;
}

export type WellnessEntry = {
  id: string;
  /** 誰のことか（1on1の相手のスタッフ） */
  userId: string;
  /** どの1on1か（private_store の owner_id と record_key） */
  ownerId: string;
  oneOnOneKey: string;
  /** 実施日（保存のたびに1on1の記録から取り直す） */
  heldOn: string;
  tags: WellnessKey[];
  notes: Partial<Record<WellnessKey, string>>;
  updatedAt: string;
};

/** 1回分の行id。同じ1on1でも「誰のことか」で分ける */
export function wellnessId(userId: string, ownerId: string, oneOnOneKey: string): string {
  return `wellness-${userId}-${ownerId}-${oneOnOneKey}`;
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeWellnessEntry(id: string, raw: unknown): WellnessEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = str(o.userId);
  const ownerId = str(o.ownerId);
  const oneOnOneKey = str(o.oneOnOneKey);
  if (!userId || !ownerId || !oneOnOneKey) return null;
  const tags = normalizeWellnessTags(o.tags);
  return {
    id,
    userId,
    ownerId,
    oneOnOneKey,
    heldOn: /^\d{4}-\d{2}-\d{2}$/.test(str(o.heldOn)) ? str(o.heldOn) : "",
    tags,
    notes: normalizeWellnessNotes(o.notes, tags),
    updatedAt: str(o.updatedAt, 40),
  };
}

/** 新しい順（同じ日は更新の新しい順） */
export function sortWellnessHistory(entries: readonly WellnessEntry[]): WellnessEntry[] {
  return entries
    .filter((e) => e.tags.length > 0)
    .slice()
    .sort(
      (a, b) =>
        (b.heldOn || "").localeCompare(a.heldOn || "") ||
        (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );
}

/** まだ一度も話していない面（定義の順） */
export function untouchedWellnessKeys(entries: readonly WellnessEntry[]): WellnessKey[] {
  const seen = new Set(entries.flatMap((e) => e.tags));
  return WELLNESS_KEYS.filter((k) => !seen.has(k));
}

// ─── 画面の文言（指示書 §3。**一言一句変えない**） ───

export const WELLNESS_SECTION_TITLE = "🌿 ウェルネスの視点";

/** 欄の下に添える一文（点数・評価をつけないことの念押し） */
export const WELLNESS_SECTION_NOTE =
  "話した面と本人の言葉だけを残します。点数・評価はつけません。本人の画面には出ません。";

export const WELLNESS_HINTS_TITLE = "💡 問いのヒント";

export const WELLNESS_HINTS_CAUTION: readonly string[] = [
  "毎回すべて聞かない。気になる次元を1〜2つ選ぶ。",
  "身体・金銭・家庭のことは本人が話したい範囲で。踏み込まず、話してくれたら受け止める。",
  "記録は「話した次元」と「本人の言葉のメモ」だけ。点数・評価はつけない。",
];

export const WELLNESS_HINTS_OPENING: readonly string[] = [
  "最近の毎日を一言で表すと？",
  "8つの面（身体・感情・知性・職業・社会・環境・金銭・精神）で、いちばん満たされている／気になっているのは？",
];

export const WELLNESS_HINTS_BY_KEY: Record<WellnessKey, string> = {
  physical: "最近、よく眠れている？ 体の調子で気になることは？",
  emotional: "最近うれしかったこと、しんどかったことは？ それをどう受け止めた？",
  intellectual: "いま興味があること、学んでみたいことは？",
  occupational: "仕事で「やってよかった」と思えた瞬間は？ 強みを活かせている？",
  social: "最近、仲間に支えられた・支えた場面は？ 居場所を感じる？",
  environmental: "働く環境で、整えたいこと・困っていることは？",
  financial: "（本人が話題にしたときのみ）将来に向けて考えていることはある？",
  spiritual: "人生でいちばん大切にしたいことは？ それはいまの仕事とつながっている？",
};

export const WELLNESS_HINTS_NEXT: readonly string[] = [
  "気になっている面を少し整えるために、来月までにできる小さな一歩は？",
  "院（私）にできるサポートは？",
];

/** 書き起こしから作った候補であることの説明（指示書 §4） */
export const WELLNESS_CANDIDATE_NOTE =
  "AIが見つけた「話題に出た面」の候補です。押して選んだものだけが保存されます。";
