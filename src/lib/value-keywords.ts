// 価値観キーワード（指示書68 → 172で管理画面編集に対応）: 語の一覧から3〜5個選んでメンバー紹介で共有する。
// 5つの基本的欲求サーベイと同じく「相互理解のための共有」であり、評価・優劣付けには使わない。
//
// 【保存先】
// - スタッフの選択: staff_profile:<userId>.valueKeywords（string[] = 語の**識別子**の配列・専用テーブルなし）
// - 語の一覧（172）: content_store `value_keywords_config`
//     { words: [{id,label}], retired: [{id,label,retiredAt}], min, max, updatedAt }
//   未保存・不正なら既定（下の52語・3〜5個）で動く（歯止め5）。
//   書き込みは /api/admin/value-keywords だけ（管理者＋操作ログ付き）。/api/content-store からは書けない。
// - 操作ログ（172）: content_store `value_keywords_log`（サーバー専用キー・管理者APIでのみ閲覧）
//
// 【識別子と表示名の分離（172-3-2。167のカテゴリ名と同じ考え方）】
// - 既定52語は id = 表示名の文字列（既存プロフィールに保存済みの値との互換。167の役職と同じ）
// - 追加した語は id = vk_<連番>（新しい識別子を発行。表示名を後から直しても選択済みの設定は壊れない）
// - 削除した語は retired に退避する（表示名を保持）。選択済みの人の設定はそのまま残り、
//   メンバー紹介でも引き続き表示される（172-3-1）。一覧からは消えるので新たには選べない。
//
// 【52語の出所】アチーブメントの価値観カードに由来し、CDBおよび教材と揃っている（原本の並び順。50音順にしないこと）。
// 管理者だけが変更でき、変更の記録が残る（172）。

import { getContentRow } from "./content-store-core";

export const VALUE_KEYWORDS_CONFIG_KEY = "value_keywords_config";
export const VALUE_KEYWORDS_LOG_KEY = "value_keywords_log";

/** 既定の52語（原本の並び順） */
export const VALUE_KEYWORDS = [
  "愛", "いたわり", "援助", "思いやり", "感謝", "完全", "希望", "勤勉", "謙虚", "献身",
  "健全", "向上心", "公平", "最善", "正直", "純粋", "従順", "実践", "信仰", "親切",
  "栄誉", "慎重", "真剣", "真理", "信用", "信頼", "正義", "成長", "誠実", "責任感",
  "善良", "尊敬", "慎み", "忠実", "道徳", "努力", "忍耐", "熱心", "平安", "平穏",
  "平和", "奉仕", "誇り", "真面目", "約束", "優しさ", "安らぎ", "勇気", "喜び", "礼儀正しい",
  "上質", "卓越",
] as const;

/** 既定の個数（管理画面で変更可。未保存はこの値） */
export const VALUE_KEYWORDS_MAX = 5;
export const VALUE_KEYWORDS_MIN_RECOMMENDED = 3;

/** 語の表示名の最大文字数／語数の上限／個数設定の範囲 */
export const VALUE_KEYWORD_LABEL_MAX = 20;
export const VALUE_KEYWORDS_WORDS_MAX = 200;
export const VALUE_KEYWORDS_LIMIT_MIN = 1;
export const VALUE_KEYWORDS_LIMIT_MAX = 10;

export type ValueKeywordDef = { id: string; label: string };
export type RetiredValueKeyword = ValueKeywordDef & { retiredAt: string };

export type ValueKeywordsConfig = {
  /** 選べる語（この順に表示） */
  words: ValueKeywordDef[];
  /** 削除した語（表示名を保持するため残す。選択済みの人の表示に使う） */
  retired: RetiredValueKeyword[];
  /** 推奨する最小個数（強制ではない。従来どおり「あとN個選ぶと伝わりやすい」の案内） */
  min: number;
  /** 上限 */
  max: number;
  updatedAt?: string;
};

export function defaultValueKeywordsConfig(): ValueKeywordsConfig {
  return {
    words: VALUE_KEYWORDS.map((w) => ({ id: w, label: w })),
    retired: [],
    min: VALUE_KEYWORDS_MIN_RECOMMENDED,
    max: VALUE_KEYWORDS_MAX,
  };
}

export const DEFAULT_VALUE_KEYWORDS_CONFIG: ValueKeywordsConfig =
  defaultValueKeywordsConfig();

// 識別子の形式（既定語は日本語の表示名そのもの。制御文字と極端な長さだけ弾く）
const ID_RE = /^[^\s\p{C}][^\p{C}]{0,63}$/u;

export function isValidValueKeywordId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

/** 表示名の正規化（前後空白除去・改行除去・上限文字数） */
export function cleanValueKeywordLabel(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\r\n\t]/g, " ").trim().slice(0, VALUE_KEYWORD_LABEL_MAX);
}

function clampLimit(v: unknown, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(VALUE_KEYWORDS_LIMIT_MAX, Math.max(VALUE_KEYWORDS_LIMIT_MIN, n));
}

function normalizeWordList(raw: unknown): ValueKeywordDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ValueKeywordDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    if (!isValidValueKeywordId(g.id) || seen.has(g.id)) continue;
    seen.add(g.id);
    // 表示名が空なら識別子で表示（167の「空欄→既定名フォールバック」と同じ）
    const label = cleanValueKeywordLabel(g.label) || g.id;
    out.push({ id: g.id, label });
    if (out.length >= VALUE_KEYWORDS_WORDS_MAX) break;
  }
  return out;
}

/**
 * 保存データ → 設定。未保存（null）・壊れた値・語が0件なら既定52語に倒す（歯止め5）。
 * retired は words と重複する id を除く。
 */
export function normalizeValueKeywordsConfig(raw: unknown): ValueKeywordsConfig {
  if (!raw || typeof raw !== "object") return defaultValueKeywordsConfig();
  const g = raw as Record<string, unknown>;
  const words = normalizeWordList(g.words);
  if (words.length === 0) return defaultValueKeywordsConfig();
  const active = new Set(words.map((w) => w.id));
  const retiredRaw = Array.isArray(g.retired) ? g.retired : [];
  const retired: RetiredValueKeyword[] = [];
  const seen = new Set<string>();
  for (const item of retiredRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!isValidValueKeywordId(r.id) || active.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    retired.push({
      id: r.id,
      label: cleanValueKeywordLabel(r.label) || r.id,
      retiredAt: typeof r.retiredAt === "string" ? r.retiredAt.slice(0, 40) : "",
    });
  }
  const max = clampLimit(g.max, VALUE_KEYWORDS_MAX);
  const min = Math.min(clampLimit(g.min, VALUE_KEYWORDS_MIN_RECOMMENDED), max);
  return {
    words,
    retired,
    min,
    max,
    updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : undefined,
  };
}

/** 現在選べる語か */
export function isActiveValueKeyword(
  config: ValueKeywordsConfig,
  id: string
): boolean {
  return config.words.some((w) => w.id === id);
}

/** 識別子 → 表示名。一覧に無ければ削除済みの表示名、それも無ければ識別子そのもの（既定語は id＝表示名なので必ず読める） */
export function valueKeywordLabel(
  config: ValueKeywordsConfig,
  id: string
): string {
  return (
    config.words.find((w) => w.id === id)?.label ??
    config.retired.find((w) => w.id === id)?.label ??
    id
  );
}

/**
 * 選択の正規化（サーバー保存時・画面表示時の両方で使う）
 * - 現在選べる語（config.words）は常に可
 * - keep に含まれる id（＝その人がすでに保存している選択）は、一覧から消えていても**残す**（172-3-1）
 *   ※ 設定行が消えて既定に戻った場合でも、追加語（vk_N）の選択が失われない
 * - 重複除去 → 一覧の順に並べ直し（一覧に無い語は末尾・keep の順）
 * - 上限: 新しく選ぶ分は config.max まで。保存済みの分は上限を下げられても切り捨てない
 *   （上限超過の人は「解除はできるが追加はできない」状態になる）
 */
export function normalizeValueKeywords(
  input: unknown,
  config: ValueKeywordsConfig = DEFAULT_VALUE_KEYWORDS_CONFIG,
  keep: readonly string[] = []
): string[] {
  if (!Array.isArray(input)) return [];
  const order = new Map(config.words.map((w, i) => [w.id, i]));
  const keepSet = new Set(keep.filter((k): k is string => typeof k === "string"));
  const picked = Array.from(
    new Set(
      input.filter(
        (v): v is string =>
          typeof v === "string" && (order.has(v) || keepSet.has(v))
      )
    )
  );
  const kept = picked.filter((id) => keepSet.has(id));
  const fresh = picked.filter((id) => !keepSet.has(id));
  const room = Math.max(0, config.max - kept.length);
  const result = [...kept, ...fresh.slice(0, room)];
  const keepIndex = new Map(Array.from(keepSet).map((id, i) => [id, i]));
  result.sort((a, b) => {
    const oa = order.get(a);
    const ob = order.get(b);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return (keepIndex.get(a) ?? 0) - (keepIndex.get(b) ?? 0);
  });
  return result;
}

/** 表示用: 保存済みの選択（識別子）→ {id, label}[]。削除済みの語も表示名つきで返す（172-3-1） */
export function displayValueKeywords(
  config: ValueKeywordsConfig,
  stored: unknown
): ValueKeywordDef[] {
  const keep = Array.isArray(stored)
    ? stored.filter((v): v is string => typeof v === "string")
    : [];
  return normalizeValueKeywords(stored, config, keep).map((id) => ({
    id,
    label: valueKeywordLabel(config, id),
  }));
}

export function hasValueKeywords(
  v: unknown,
  config: ValueKeywordsConfig = DEFAULT_VALUE_KEYWORDS_CONFIG
): boolean {
  return displayValueKeywords(config, v).length > 0;
}

/**
 * 追加語の識別子を発行する: vk_<連番>（既存の最大番号+1。時刻・乱数は使わない）
 * 削除済み（retired）の番号も飛ばして、過去に使った識別子を再利用しない
 */
export function newValueKeywordId(config: ValueKeywordsConfig): string {
  let max = 0;
  for (const w of [...config.words, ...config.retired]) {
    const m = /^vk_(\d{1,9})$/.exec(w.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `vk_${max + 1}`;
}

/** 設定の読み込み（ブラウザ=認証API／サーバー=service-role。失敗・未保存は既定） */
export async function loadValueKeywordsConfig(): Promise<ValueKeywordsConfig> {
  try {
    const row = await getContentRow(VALUE_KEYWORDS_CONFIG_KEY);
    return normalizeValueKeywordsConfig(row?.data ?? null);
  } catch {
    return defaultValueKeywordsConfig();
  }
}

// ─── 操作ログ（172-4。159の操作ログと同じ考え方＝時系列のみ・集計なし） ───

export type ValueKeywordLogAction =
  | "追加"
  | "編集"
  | "削除"
  | "復元"
  | "並び替え"
  | "個数変更"
  | "既定に戻す";

export type ValueKeywordLog = {
  id: string;
  /** 日時 ISO */
  at: string;
  /** 操作した人（メール・サーバーが確定させる） */
  by: string;
  action: ValueKeywordLogAction;
  /** 対象の語の識別子（並び替え・個数変更では空） */
  wordId: string;
  /** 変更前 → 変更後（表示名・個数など） */
  before: string;
  after: string;
  /** 操作時点でその語を選択していた人数（削除・編集・復元のとき） */
  affected: number | null;
};

/** ログの保持件数（1キーのJSONに新しい順で持つ。超えた分は古い方から落ちる） */
export const VALUE_KEYWORDS_LOG_MAX = 500;

const LOG_ACTIONS: ValueKeywordLogAction[] = [
  "追加",
  "編集",
  "削除",
  "復元",
  "並び替え",
  "個数変更",
  "既定に戻す",
];

function logText(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeValueKeywordLog(raw: unknown): ValueKeywordLog | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const action = LOG_ACTIONS.find((a) => a === g.action);
  if (!action) return null;
  return {
    id: logText(g.id, 60),
    at: logText(g.at, 40),
    by: logText(g.by, 200),
    action,
    wordId: logText(g.wordId, 64),
    before: logText(g.before, 200),
    after: logText(g.after, 200),
    affected:
      typeof g.affected === "number" && Number.isFinite(g.affected)
        ? g.affected
        : null,
  };
}

// ─── 管理画面用のクライアント呼び出し（/api/admin/value-keywords） ───

export type ValueKeywordsAdminPayload = {
  config: ValueKeywordsConfig;
  /** 語の識別子 → 現在その語を選択している人数（削除前の注意表示に使う。172-3-1） */
  usage: Record<string, number>;
};

export async function fetchValueKeywordsAdmin(): Promise<ValueKeywordsAdminPayload> {
  const res = await fetch("/api/admin/value-keywords", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("読み込みに失敗しました");
  const json = (await res.json()) as {
    config?: unknown;
    usage?: Record<string, number>;
  };
  return {
    config: normalizeValueKeywordsConfig(json.config),
    usage: json.usage ?? {},
  };
}

export async function saveValueKeywordsAdmin(input: {
  words: ValueKeywordDef[];
  min: number;
  max: number;
}): Promise<ValueKeywordsAdminPayload> {
  const res = await fetch("/api/admin/value-keywords", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    config?: unknown;
    usage?: Record<string, number>;
  };
  if (!res.ok) throw new Error(json.error || "保存に失敗しました");
  return {
    config: normalizeValueKeywordsConfig(json.config),
    usage: json.usage ?? {},
  };
}

export async function fetchValueKeywordLogs(): Promise<ValueKeywordLog[]> {
  const res = await fetch("/api/admin/value-keywords/logs", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("操作ログの読み込みに失敗しました");
  const json = (await res.json()) as { logs?: unknown[] };
  return (Array.isArray(json.logs) ? json.logs : [])
    .map(normalizeValueKeywordLog)
    .filter((l): l is ValueKeywordLog => l !== null);
}
