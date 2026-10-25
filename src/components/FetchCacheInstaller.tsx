"use client";

// 戻ったときの表示を速くする取り置き（lib/fetch-swr.ts）を、最初の画面の読み出しより前に入れる。
// 読み込まれた時点で入れる（画面の useEffect は外側より先に動くため、useEffect の中では間に合わない）。

import { installFetchCache } from "@/lib/fetch-swr";

installFetchCache();

export function FetchCacheInstaller() {
  return null;
}
