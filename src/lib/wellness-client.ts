// 1on1の「ウェルネスの視点」API（/api/growth/wellness）のクライアント呼び出し
// 画面側はこのファイルの関数だけを呼ぶ（fetch の直書きをしない）。

import type { WellnessEntry, WellnessKey } from "./wellness";

const API = "/api/growth/wellness";

export type WellnessScope = { all: boolean; staffIds: string[] };

export type WellnessListResult =
  | { ok: true; entries: WellnessEntry[]; scope: WellnessScope }
  /** 見られない人（スタッフ本人・担当外・未ログイン）＝画面に何も出さない */
  | { ok: false };

export async function fetchWellnessApi(user?: string): Promise<WellnessListResult> {
  try {
    const res = await fetch(user ? `${API}?user=${encodeURIComponent(user)}` : API, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return { ok: false };
    const j = (await res.json()) as { entries?: WellnessEntry[]; scope?: WellnessScope };
    return {
      ok: true,
      entries: Array.isArray(j.entries) ? j.entries : [],
      scope: j.scope ?? { all: false, staffIds: [] },
    };
  } catch {
    return { ok: false };
  }
}

/** その人のことを、この画面で書いてよいか（判定の正本はサーバー。ここは欄を出すかどうかだけ） */
export function canWriteWellness(scope: WellnessScope | null, myId: string, userId: string): boolean {
  if (!scope || !userId || userId === myId) return false;
  return scope.all || scope.staffIds.includes(userId);
}

export async function saveWellnessApi(input: {
  userId: string;
  ownerId: string;
  oneOnOneKey: string;
  tags: WellnessKey[];
  notes: Partial<Record<WellnessKey, string>>;
}): Promise<WellnessEntry | null> {
  const res = await fetch(API, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = (await res.json().catch(() => ({}))) as { entry?: WellnessEntry | null; error?: string };
  if (!res.ok) throw new Error(j.error && j.error !== "Not Found" && j.error !== "Forbidden" ? j.error : "ウェルネスの視点を保存できませんでした");
  return j.entry ?? null;
}

/** 1on1の記録を消したときの後片づけ（失敗しても1on1の削除は止めない） */
export async function deleteWellnessApi(userId: string, ownerId: string, oneOnOneKey: string): Promise<void> {
  const q = new URLSearchParams({ user: userId, owner: ownerId, key: oneOnOneKey });
  await fetch(`${API}?${q.toString()}`, { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
}
