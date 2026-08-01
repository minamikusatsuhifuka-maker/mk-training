// ヒヤリハット報告（指示書106・機能ID hiyari）— 型・定数・正規化・読み書き
// - content_store 単一キー hiyari_reports（{ posts, updatedAt }）。
//   既存「気づきシェア」の portal_hiyari とは完全に別キー・既存は無改変。
// - 記名基本＋匿名選択可（院長決定）。真の匿名を厳守: 匿名時は authorId を
//   フィールドごと保存しない（管理者にも特定できない。裏で特定できる実装は禁止）。
// - 論理削除（deleted: true・管理画面から復元）。
// - リアクションは既存排他モデルを hiyari_reactions キーで流用。
// - 雛形は lib/kizuki.ts。authorId が optional な点だけが本質的な違い
//   （kizuki の normalize は authorId 必須のため流用不可＝専用型 HiyariReport を持つ）。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const HIYARI_REPORTS_KEY = "hiyari_reports";
// 排他リアクションの保存先（useNewsReactions(HIYARI_REACTIONS_KEY) で渡す）
export const HIYARI_REACTIONS_KEY = "hiyari_reactions";

export type HiyariLevel = "0" | "1";

export type HiyariReport = {
  id: string;
  authorId?: string; // 記名時のみ。匿名時はフィールド自体を保存しない（真の匿名）
  authorName: string; // 記名時はプロフィール名／匿名時は「匿名」
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean; // 論理削除（管理画面から復元できる）
  // ── 指示書122: 構造化フィールド（すべて任意・旧投稿は欠落のまま有効） ──
  occurredOn?: string; // 発生日 "YYYY-MM-DD"
  timeSlot?: string; // HIYARI_TIME_SLOTS の value
  place?: string; // HIYARI_PLACES の value
  placeOther?: string; // 場所=その他の時のみ
  factors?: string[]; // HIYARI_FACTORS の value（複数可）
  factorOther?: string; // 要因にその他を含む時のみ
  level?: HiyariLevel; // 影響の程度
  countermeasure?: string; // 当面の対策・改善案
  role?: string; // 職種（記名時のみ。匿名投稿では normalize でも破棄する）
};

// ── 選択肢定数（指示書122・ここに集約。スタッフ側・管理側・集計で共用） ──

export const HIYARI_TIME_SLOTS = [
  { value: "morning", label: "朝（診療前）" },
  { value: "am", label: "午前診" },
  { value: "noon", label: "昼休み" },
  { value: "pm", label: "午後診" },
  { value: "after", label: "診療後" },
  { value: "other", label: "その他" },
] as const;

export const HIYARI_PLACES = [
  { value: "shinsatsu", label: "診察室" },
  { value: "shochi", label: "処置室" },
  { value: "sejutsu", label: "施術室" },
  { value: "uketsuke", label: "受付" },
  { value: "machiai", label: "待合室" },
  { value: "backyard", label: "バックヤード" },
  { value: "other", label: "その他" },
] as const;

export const HIYARI_FACTORS = [
  { value: "confirm", label: "確認不足", hint: "患者誤認・薬剤・データ確認漏れなど" },
  { value: "communication", label: "連絡・情報共有不足", hint: "申し送り・指示の曖昧さなど" },
  { value: "environment", label: "環境・設備", hint: "障害物・照明・機器不具合など" },
  { value: "procedure", label: "手順・マニュアル", hint: "手順が未定・複雑・ルール非遵守など" },
  { value: "hurry", label: "焦り・多忙・疲労", hint: "割り込み業務・混雑など" },
  { value: "other", label: "その他", hint: "" },
] as const;

export const HIYARI_LEVELS = [
  {
    value: "0",
    label: "レベル0",
    desc: "実施前に気づいた（患者様への影響なし）",
    badge: "🟢L0",
    badgeClass: "bg-emerald-100 text-emerald-800",
  },
  {
    value: "1",
    label: "レベル1",
    desc: "実施されたが実害・追加処置はなかった",
    badge: "🟡L1",
    badgeClass: "bg-yellow-100 text-yellow-800",
  },
] as const;

export const HIYARI_ROLES = [
  { value: "doctor", label: "医師" },
  { value: "nurse", label: "看護師" },
  { value: "clerk", label: "医療事務" },
  { value: "other", label: "その他" },
] as const;

// value→label の逆引き（未知の値は空文字＝表示しない）
export function hiyariOptionLabel(
  options: readonly { value: string; label: string }[],
  value: string | undefined
): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? "";
}

// 正規化のホワイトリスト（定数から導出・値の追加はここに波及）
const TIME_SLOT_VALUES = new Set<string>(HIYARI_TIME_SLOTS.map((o) => o.value));
const PLACE_VALUES = new Set<string>(HIYARI_PLACES.map((o) => o.value));
const FACTOR_VALUES = new Set<string>(HIYARI_FACTORS.map((o) => o.value));
const ROLE_VALUES = new Set<string>(HIYARI_ROLES.map((o) => o.value));

export type HiyariReportStore = { posts: HiyariReport[]; updatedAt: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// "YYYY-MM-DD" 形式のみ通す（それ以外は空文字＝破棄）
function ymdStr(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// 1件の正規化（id・本文が欠けるものは破棄。authorId は無くてよい＝匿名）
// 指示書122の構造化フィールドはホワイトリスト検証: 定数に無い値・不正な形式は
// フィールドごと破棄する。保存経路は常に「全件正規化→丸ごと保存」なので、
// ここで素通しできないフィールドは次の保存で消える＝ここが正本のガード。
export function normalizeHiyariReport(raw: unknown): HiyariReport | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const body = str(g.body);
  if (!id || !body.trim()) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  const authorId = str(g.authorId);

  const occurredOn = ymdStr(g.occurredOn);
  const timeSlot = TIME_SLOT_VALUES.has(str(g.timeSlot)) ? str(g.timeSlot) : "";
  const place = PLACE_VALUES.has(str(g.place)) ? str(g.place) : "";
  // placeOther は場所=その他の時のみ有効
  const placeOther = place === "other" ? str(g.placeOther).trim() : "";
  const factors = Array.from(
    new Set(
      (Array.isArray(g.factors) ? g.factors : []).filter(
        (f): f is string => typeof f === "string" && FACTOR_VALUES.has(f)
      )
    )
  );
  // factorOther は要因にその他を含む時のみ有効
  const factorOther = factors.includes("other")
    ? str(g.factorOther).trim()
    : "";
  const level: HiyariLevel | "" =
    g.level === "0" || g.level === "1" ? g.level : "";
  const countermeasure = str(g.countermeasure).trim();
  // 匿名の安全弁（二重化・指示書122）: 匿名投稿（authorId なし）の role は
  // どの経路から書かれてもここで破棄する（職種で個人が特定され得るため）
  const role =
    authorId && ROLE_VALUES.has(str(g.role)) ? str(g.role) : "";

  return {
    id,
    // 匿名投稿の authorId を後から生やさない（空文字も含めない）
    ...(authorId ? { authorId } : {}),
    authorName: str(g.authorName) || "匿名",
    body,
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
    ...(occurredOn ? { occurredOn } : {}),
    ...(timeSlot ? { timeSlot } : {}),
    ...(place ? { place } : {}),
    ...(placeOther ? { placeOther } : {}),
    ...(factors.length > 0 ? { factors } : {}),
    ...(factorOther ? { factorOther } : {}),
    ...(level ? { level } : {}),
    ...(countermeasure ? { countermeasure } : {}),
    ...(role ? { role } : {}),
  };
}

export function normalizeHiyariStore(raw: unknown): HiyariReportStore {
  const data = raw as { posts?: unknown; updatedAt?: unknown } | null;
  const list = Array.isArray(data?.posts) ? data!.posts : [];
  const posts = list
    .map(normalizeHiyariReport)
    .filter((p): p is HiyariReport => p !== null);
  return { posts, updatedAt: str(data?.updatedAt) };
}

export async function loadHiyariStore(): Promise<HiyariReportStore> {
  const obj = await loadPortalObject<unknown>(HIYARI_REPORTS_KEY, null);
  return normalizeHiyariStore(obj);
}

export async function saveHiyariStore(
  posts: HiyariReport[]
): Promise<boolean> {
  return savePortalObject(HIYARI_REPORTS_KEY, {
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genHiyariReportId(): string {
  return `hyr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き新着順
export function visibleHiyariReports(posts: HiyariReport[]): HiyariReport[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
