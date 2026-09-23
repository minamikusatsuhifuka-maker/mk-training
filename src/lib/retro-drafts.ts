// 院長の振り返り記録の下書き（指示書176-補・クライアント専用）
//
// 保存ボタンを押す前の入力を、開閉・再読み込み・誤操作で失わないための一時置き場。
//   - 置き場は **sessionStorage のみ**（localStorage は使わない）。
//     赤裸々な内容を端末に残し続けないため、タブを閉じれば消える。
//   - 下書きは保存済みの記録を上書きしない（サーバーには送らない。保存ボタンだけが送る）。
//   - 初期値（保存済みの値）と同じに戻したら下書きは消える＝「下書きあり」は本当に書きかけのときだけ。
//
// キーの設計: `mk-retro-draft:v1:` + 下の draftKeyOf の戻り値
//   期の新規          period:new
//   期の編集          period:<期id>
//   期の中の記録      <種類>:<期id>:new ／ <種類>:<期id>:<記録id>
//   発表の構成案(174) plan:conditions

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

const PREFIX = "mk-retro-draft:v1:";

/** sessionStorage が使えない環境（プライベートモードの一部など）ではタブ内のメモリに退避する */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

export function draftKeyOf(kind: string, periodId: string | null, id: string): string {
  return periodId ? `${kind}:${periodId}:${id}` : `${kind}:${id}`;
}

export function readDraft<T>(key: string): T | null {
  let raw: string | null = null;
  const s = storage();
  try {
    raw = s ? s.getItem(PREFIX + key) : null;
  } catch {
    raw = null;
  }
  if (raw === null) raw = memory.get(key) ?? null;
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

function exists(key: string): boolean {
  const s = storage();
  try {
    if (s && s.getItem(PREFIX + key) !== null) return true;
  } catch {
    /* 読めない */
  }
  return memory.has(key);
}

/** 書き込む。通知は「下書きが新しくできた」ときだけ（打鍵ごとに画面全体を描き直さない） */
export function writeDraft(key: string, value: unknown): void {
  const existed = exists(key);
  const raw = JSON.stringify(value);
  const s = storage();
  try {
    if (s) s.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
  } catch {
    memory.set(key, raw); // 容量超過など
  }
  if (!existed) notify();
}

export function clearDraft(key: string): void {
  if (!exists(key)) return;
  const s = storage();
  try {
    s?.removeItem(PREFIX + key);
  } catch {
    /* 消せなくても続ける */
  }
  memory.delete(key);
  notify();
}

/** 下書きのキー一覧（prefix で絞り込み）。PREFIX は外した形で返す */
export function listDraftKeys(prefix = ""): string[] {
  const out = new Set<string>();
  const s = storage();
  try {
    if (s) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX + prefix)) out.add(k.slice(PREFIX.length));
      }
    }
  } catch {
    /* 読めない分は飛ばす */
  }
  for (const k of memory.keys()) if (k.startsWith(prefix)) out.add(k);
  return Array.from(out);
}

export function hasAnyDraft(): boolean {
  return listDraftKeys().length > 0;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// 下書きキー一覧のスナップショット（増減したときだけ新しい配列にする）
let cachedKeys: { v: number; keys: string[] } | null = null;
const NO_KEYS: string[] = [];
function keysSnapshot(): string[] {
  if (!cachedKeys || cachedKeys.v !== version) cachedKeys = { v: version, keys: listDraftKeys() };
  return cachedKeys.keys;
}

/**
 * 下書きのキー一覧（増減で再描画）。「下書きあり」の印はこの戻り値から求めること。
 * React Compiler が有効なので、描画中に listDraftKeys() を直接呼ぶと結果がメモ化されて印が更新されない。
 * サーバー描画時は空（水和のずれを起こさない）。
 */
export function useDraftKeys(): string[] {
  return useSyncExternalStore(subscribe, keysSnapshot, () => NO_KEYS);
}

/**
 * prefix に当たる下書きがあるか。サーバー描画時は false（水和のずれを起こさない）。
 * データ取得前から描画される場所（期の新規・174の見出し）で使う。
 */
export function useHasDraft(prefix: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => listDraftKeys(prefix).length > 0,
    () => false
  );
}

function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 入力欄の値を下書きと結びつける。
 * - 初回は「保存済みの値（initial）に下書きを重ねた値」から始める
 * - 変更のたびに下書きへ書く。initial と同じに戻ったら下書きを消す
 * - dirty = 下書きがある（保存していない書きかけがある）
 *
 * 呼び出し側は、このフックを持つ部品がサーバー描画されない（データ取得後に出る）か、
 * 取得後に key が決まる場所で使うこと（sessionStorage を初回描画で読むため）。
 */
export function useDraft<T extends Record<string, unknown>>(key: string, initial: T) {
  const [base] = useState<T>(() => initial);
  const [values, setValuesState] = useState<T>(() => {
    const d = readDraft<Partial<T>>(key);
    return d ? { ...base, ...d } : base;
  });
  const [dirty, setDirty] = useState<boolean>(() => {
    const d = readDraft<Partial<T>>(key);
    return !!d && !sameValues({ ...base, ...d }, base);
  });

  const valuesRef = useRef(values);

  const setValues = useCallback(
    (update: (prev: T) => T) => {
      const next = update(valuesRef.current);
      valuesRef.current = next;
      setValuesState(next);
      const isDirty = !sameValues(next, base);
      if (isDirty) writeDraft(key, next);
      else clearDraft(key);
      setDirty(isDirty);
    },
    [key, base]
  );

  const set = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => setValues((prev) => ({ ...prev, [field]: value })),
    [setValues]
  );

  const discard = useCallback(() => {
    clearDraft(key);
    valuesRef.current = base;
    setDirty(false);
    setValuesState(base);
  }, [key, base]);

  return { values, set, setValues, dirty, discard };
}

export const DISCARD_CONFIRM =
  "書きかけの内容（まだ保存していない入力）を破棄します。\n\nよろしいですか？";
