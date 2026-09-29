"use client";
// 院内端末のクライアント側の目印（指示書192 D）
//   院内端末でログインしているタブには sessionStorage に印を置き、ログアウト（手動・自動）で下書き（176-補）ごと消す。
//   端末の鍵そのもの（HttpOnly Cookie）は JS から読めない。ここに置くのは「院内端末かどうか」だけ。

export const TERMINAL_FLAG_KEY = "mkt-terminal";

export function markTerminalSession(terminal: boolean): void {
  try {
    if (terminal) window.sessionStorage.setItem(TERMINAL_FLAG_KEY, "1");
    else window.sessionStorage.removeItem(TERMINAL_FLAG_KEY);
  } catch {
    /* sessionStorage が使えない環境では何もしない */
  }
}

export function isTerminalSession(): boolean {
  try {
    return window.sessionStorage.getItem(TERMINAL_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** 院内端末なら、そのタブの下書き（sessionStorage）をすべて消す。院内端末でなければ触らない */
export function clearDraftsIfTerminal(force = false): boolean {
  try {
    if (!force && !isTerminalSession()) return false;
    window.sessionStorage.clear();
    return true;
  } catch {
    return false;
  }
}
