// プロフィールの役職選択肢（指示書51）
// 定義は content_store `profile_role_config` に { roles: [...] } で保存し、
// スタッフの役職値は従来どおり staff_profile:<userId> の role に「役職の id」で保存する。
// 既定6役職は id を現行のラベル文字列のまま維持（既存プロフィールの role 値との互換）。
// 新規追加の役職は id = r_xxxx（自動生成）。
// 削除は置かず「非表示」で運用: hidden の役職は選択肢から消えるが、
// 使用中メンバーの表示（ラベル・色）は resolveRole で解決され壊れない。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const PROFILE_ROLE_CONFIG_KEY = "profile_role_config";

// ─── ロールカラー ───
// 自由HEXは不可（purge回避とトーン統一のため、下記の色名から選ぶ）。
export const ROLE_COLOR_NAMES = [
  "sky",
  "violet",
  "indigo",
  "emerald",
  "rose",
  "amber",
  "teal",
  "slate",
] as const;

export type RoleColorName = (typeof ROLE_COLOR_NAMES)[number];

export type RoleColorClasses = {
  bg: string; // アバター淡背景・ピル背景
  text: string; // ピル文字色
  border: string; // ひとことの縦線
  swatch: string; // 管理UIの色見本
};

// Tailwind purge回避のためリテラルクラスで定義（動的組み立て禁止）。
// 既定6役職ぶんは /members の旧 ROLE_COLORS（指示書33）と同一クラス。
export const ROLE_COLOR_CLASSES: Record<RoleColorName, RoleColorClasses> = {
  sky: {
    bg: "bg-sky-100",
    text: "text-sky-700",
    border: "border-sky-300",
    swatch: "bg-sky-400",
  },
  violet: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    border: "border-violet-300",
    swatch: "bg-violet-400",
  },
  indigo: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-300",
    swatch: "bg-indigo-400",
  },
  emerald: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
    swatch: "bg-emerald-400",
  },
  rose: {
    bg: "bg-rose-100",
    text: "text-rose-700",
    border: "border-rose-300",
    swatch: "bg-rose-400",
  },
  amber: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-300",
    swatch: "bg-amber-400",
  },
  teal: {
    bg: "bg-teal-100",
    text: "text-teal-700",
    border: "border-teal-300",
    swatch: "bg-teal-400",
  },
  slate: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
    swatch: "bg-slate-400",
  },
};

// 管理UIの色select用
export const ROLE_COLOR_OPTIONS: { value: RoleColorName; label: string }[] = [
  { value: "sky", label: "スカイ（水色）" },
  { value: "violet", label: "バイオレット（紫）" },
  { value: "indigo", label: "インディゴ（藍）" },
  { value: "emerald", label: "エメラルド（緑）" },
  { value: "rose", label: "ローズ（桃）" },
  { value: "amber", label: "アンバー（黄）" },
  { value: "teal", label: "ティール（青緑）" },
  { value: "slate", label: "スレート（灰）" },
];

// ─── 役職定義 ───
export type ProfileRoleDef = {
  id: string;
  label: string;
  color: RoleColorName;
  order: number;
  hidden?: boolean;
};

// 既定セット = 現行6役職（idは現行のラベル値のまま・色は指示書33の現行どおり）
export const DEFAULT_PROFILE_ROLES: ProfileRoleDef[] = [
  { id: "受付", label: "受付", color: "sky", order: 1 },
  { id: "クラーク", label: "クラーク", color: "violet", order: 2 },
  { id: "医療クラーク", label: "医療クラーク", color: "indigo", order: 3 },
  { id: "看護師", label: "看護師", color: "emerald", order: 4 },
  { id: "カウンセラー", label: "カウンセラー", color: "rose", order: 5 },
  { id: "その他", label: "その他", color: "slate", order: 6 },
];

function isRoleColorName(v: unknown): v is RoleColorName {
  return (
    typeof v === "string" && (ROLE_COLOR_NAMES as readonly string[]).includes(v)
  );
}

// 保存データを検証して安全な役職配列にする。
// 不正・空なら既定セットにフォールバック。config に無い既定 id は末尾に自動追加（既定役職は消えない）。
export function normalizeProfileRoles(raw: unknown): ProfileRoleDef[] {
  const roles: ProfileRoleDef[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      if (typeof o.id !== "string" || !o.id.trim()) continue;
      if (typeof o.label !== "string" || !o.label.trim()) continue;
      roles.push({
        id: o.id.trim(),
        label: o.label.trim(),
        color: isRoleColorName(o.color) ? o.color : "slate",
        order: typeof o.order === "number" ? o.order : roles.length + 1,
        hidden: o.hidden === true ? true : undefined,
      });
    }
  }
  if (roles.length === 0) return DEFAULT_PROFILE_ROLES.map((r) => ({ ...r }));
  const ids = new Set(roles.map((r) => r.id));
  for (const d of DEFAULT_PROFILE_ROLES) {
    if (!ids.has(d.id)) {
      roles.push({ ...d, order: roles.length + 1 });
    }
  }
  return roles;
}

// 読み込み（order昇順。設定が無ければ既定セット）
export async function loadProfileRoleConfig(): Promise<ProfileRoleDef[]> {
  const payload = await loadPortalObject<{ roles?: unknown } | null>(
    PROFILE_ROLE_CONFIG_KEY,
    null
  );
  const roles = normalizeProfileRoles(payload?.roles);
  return [...roles].sort((a, b) => a.order - b.order);
}

// 保存（orderを1から振り直して保存）
export async function saveProfileRoleConfig(
  roles: ProfileRoleDef[]
): Promise<boolean> {
  const body = roles.map((r, i) => ({ ...r, order: i + 1 }));
  return savePortalObject(PROFILE_ROLE_CONFIG_KEY, { roles: body });
}

// 選択肢に出す役職（hidden除外・order昇順）
export function visibleProfileRoles(
  roles: ProfileRoleDef[]
): ProfileRoleDef[] {
  return roles.filter((r) => !r.hidden).sort((a, b) => a.order - b.order);
}

// role値（id）→ 表示ラベル＋色クラスの解決。
// hidden の役職でも解決する（使用中メンバーの表示を壊さない）。
// 未知の値は値そのものをラベルに、色は slate にフォールバック。
export function resolveRole(
  roles: ProfileRoleDef[],
  roleValue: string | undefined | null
): { label: string; colors: RoleColorClasses } {
  const v = (roleValue ?? "").trim();
  if (!v) return { label: "", colors: ROLE_COLOR_CLASSES.slate };
  const def = roles.find((r) => r.id === v);
  if (def) return { label: def.label, colors: ROLE_COLOR_CLASSES[def.color] };
  return { label: v, colors: ROLE_COLOR_CLASSES.slate };
}
