// 「選ぶ」欄の accept と同じ規則で、ファイルの種類を確かめる（指示書233-補）— 純関数・依存なし
//
// ブラウザの accept の決まりに合わせる:
//   ".csv" のような拡張子 … ファイル名の終わりで見る（大文字・小文字は区別しない）
//   "image/*" のようなまとまり … 種類（MIME）の前半で見る
//   "text/csv" のような種類 … 種類（MIME）が同じか
//   accept が空 … 何でも通す（「選ぶ」も絞らない）
// 「選ぶ」の画面は accept で絞られるが、ドラッグ＆ドロップでは絞られない。その差をここで埋める。

export function acceptTokens(accept: string): string[] {
  return (accept || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function fileMatchesAccept(file: { name: string; type: string }, accept: string): boolean {
  const tokens = acceptTokens(accept);
  if (tokens.length === 0) return true;
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith(".")) return name.endsWith(t);
    if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/**
 * 持ってきている途中（中身の名前はまだ分からない・種類だけ分かる）で、合いそうな物が1つでもあるか。
 * 種類が空の物（拡張子でしか分からない）は、落とすまで分からないので「合いそう」に倒す。
 */
export function dragTypesMayMatch(types: readonly string[], accept: string): boolean {
  const tokens = acceptTokens(accept);
  if (tokens.length === 0 || types.length === 0) return true;
  return types.some((raw) => {
    const type = (raw || "").toLowerCase();
    if (!type) return true;
    return tokens.some((t) => {
      if (t.startsWith(".")) return true; // 拡張子は名前が要るので、ここでは断らない
      if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
      return type === t;
    });
  });
}

/** 合う物と合わない物に分ける（並びは落とした順のまま） */
export function splitByAccept<T extends { name: string; type: string }>(files: readonly T[], accept: string): { ok: T[]; rejected: T[] } {
  const ok: T[] = [];
  const rejected: T[] = [];
  for (const f of files) (fileMatchesAccept(f, accept) ? ok : rejected).push(f);
  return { ok, rejected };
}
