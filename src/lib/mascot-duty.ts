// 月替わりマスコット当番（指示書146-A）
// 毎月の「当番キャラ」を24キャラの巡回で自動選出する。管理画面から月単位の手動上書きも可能。
// - 自動選出は決定的（同じ月なら誰が見ても同じキャラ）。DBに書かないので未設定でも必ず1体決まる。
// - 巡回は「年*12+月」を通し番号にした剰余なので、24ヶ月で一巡し同じ月内で入れ替わらない。
// - 上書きは content_store `portal_mascot_duty` に月ごとに保存（管理者のみ・policy側で強制）。

import { CHARACTER_CHOICES } from "./character-order";
import { loadPortalObject, savePortalObject } from "./portal-store";
import type { CharacterSvgType } from "@/types/portal";

export const MASCOT_DUTY_KEY = "portal_mascot_duty";

export type MascotDutyStore = {
  // { "2026-08": "rakkon" } 形式。指定が無い月は自動選出。
  overrides: Record<string, CharacterSvgType>;
  updatedAt: string;
};

const EMPTY: MascotDutyStore = { overrides: {}, updatedAt: "" };

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentYm(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 当番キャラの自動選出（決定的・24ヶ月周期の巡回） */
export function autoMascotForYm(ym: string): CharacterSvgType {
  const pool = CHARACTER_CHOICES.map((c) => c.type);
  if (pool.length === 0) return "cat";
  const m = YM_RE.exec(ym);
  if (!m) return pool[0];
  const [y, mo] = ym.split("-").map(Number);
  const serial = y * 12 + (mo - 1);
  return pool[((serial % pool.length) + pool.length) % pool.length];
}

export function normalizeMascotDuty(raw: unknown): MascotDutyStore {
  if (!raw || typeof raw !== "object") return EMPTY;
  const o = raw as Record<string, unknown>;
  const src = o.overrides;
  const overrides: Record<string, CharacterSvgType> = {};
  if (src && typeof src === "object") {
    const known = new Set(CHARACTER_CHOICES.map((c) => c.type as string));
    for (const [ym, v] of Object.entries(src as Record<string, unknown>)) {
      if (!YM_RE.test(ym)) continue;
      if (typeof v !== "string" || !known.has(v)) continue;
      overrides[ym] = v as CharacterSvgType;
    }
  }
  return {
    overrides,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export async function loadMascotDuty(): Promise<MascotDutyStore> {
  const raw = await loadPortalObject<unknown>(MASCOT_DUTY_KEY, null);
  return normalizeMascotDuty(raw);
}

/** 保存は管理者のみ（サーバー側 content-store-policy でも強制） */
export async function saveMascotDuty(store: MascotDutyStore): Promise<boolean> {
  return savePortalObject<MascotDutyStore>(MASCOT_DUTY_KEY, {
    overrides: store.overrides,
    updatedAt: new Date().toISOString(),
  });
}

/** その月の当番キャラ（手動上書きがあればそれ、無ければ自動選出） */
export function mascotForYm(
  store: MascotDutyStore | null | undefined,
  ym: string
): CharacterSvgType {
  const ov = store?.overrides?.[ym];
  return ov ?? autoMascotForYm(ym);
}

export function mascotLabel(type: CharacterSvgType): string {
  return CHARACTER_CHOICES.find((c) => c.type === type)?.label ?? "";
}
