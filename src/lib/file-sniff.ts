// ファイルの中身（先頭の印）から本当の種類を見る — 純関数・依存なし
//
// 228 でお知らせ・イベントのサーバーに入れた確かめ（lib/notices.ts にあった sniffFileType）を、ここに移して共通にした（指示書234）。
// 拡張子や、ブラウザが付けた種類（MIME）は付け替えられるので、それだけでは信用しない。中身の印と、名前（拡張子）の両方を見る。
//
// 使っている所: 📣 お知らせ・イベント（228）／🗂️ 資料庫・👤 プロフィールの写真・📋 みんなのタスク・🏛️ 組織知識ベース（234）
//
// 中身の印で見分けられない種類（CSV・テキスト・Markdown など）は、ここでは扱わない（呼び出し側の決まりに任せる）。

export type SniffedType = "jpeg" | "png" | "webp" | "gif" | "pdf" | "zip" | "cfb" | "unknown";

/** PDF の印「%PDF-」は、先頭に少し余計なものが付いた物もあるので、最初の1024バイトの中で探す（読むソフトと同じ扱い） */
const PDF_SEARCH_BYTES = 1024;

function startsWith(b: Uint8Array, sig: readonly number[], at = 0): boolean {
  if (b.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
}

export function sniffFileType(b: Uint8Array): SniffedType {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8（GIF87a / GIF89a）
  // Word・PowerPoint・Excel の新しい形式（.docx/.pptx/.xlsx）は ZIP の入れ物
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  // Word・PowerPoint・Excel の古い形式（.doc/.ppt/.xls）は OLE（複合ファイル）の入れ物
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "cfb";
  const n = Math.min(b.length, PDF_SEARCH_BYTES);
  for (let i = 0; i + 5 <= n; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return "pdf";
  }
  return "unknown";
}

/** 拡張子 → その拡張子のファイルが持つべき中身の印 */
const EXT_SNIFF: Record<string, SniffedType> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  pdf: "pdf",
  docx: "zip",
  pptx: "zip",
  xlsx: "zip",
  doc: "cfb",
  ppt: "cfb",
  xls: "cfb",
};

/** 種類（MIME）→ 持つべき中身の印（画像と PDF だけ。Office は拡張子で見る） */
const MIME_SNIFF: Record<string, SniffedType> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export function extOfName(name: string): string {
  const n = (name || "").toLowerCase();
  const dot = n.lastIndexOf(".");
  return dot >= 0 ? n.slice(dot + 1) : "";
}

export type ContentCheck = { ok: true; sniffed: SniffedType } | { ok: false; sniffed: SniffedType; reason: "not_allowed" | "name_mismatch" | "mime_mismatch" };

/**
 * 中身がその場所で受け付ける種類か、名前（拡張子）・種類（MIME）と合っているかを確かめる。
 *   allowed … その場所で受け付ける中身の印（今受け付けている種類と同じにする）
 *   name    … ファイル名。拡張子が付いていて、印の分かる拡張子なら、中身と合っていること
 *   mime    … ブラウザが付けた種類。画像・PDF の種類が付いていたら、中身と合っていること
 * 合わなければ ok:false（呼び出し側は、保存も読み取りもせずに断る）。
 */
export function checkFileContent(
  bytes: Uint8Array,
  opts: { allowed: readonly SniffedType[]; name?: string; mime?: string }
): ContentCheck {
  const sniffed = sniffFileType(bytes);
  if (sniffed === "unknown" || !opts.allowed.includes(sniffed)) return { ok: false, sniffed, reason: "not_allowed" };
  const byExt = EXT_SNIFF[extOfName(opts.name ?? "")];
  if (byExt && byExt !== sniffed) return { ok: false, sniffed, reason: "name_mismatch" };
  const byMime = MIME_SNIFF[(opts.mime ?? "").toLowerCase()];
  if (byMime && byMime !== sniffed) return { ok: false, sniffed, reason: "mime_mismatch" };
  return { ok: true, sniffed };
}

/** base64（dataURL の頭なし）の先頭だけを読み、中身の印を見るためのバイト列にする（全体は読まない） */
export function headBytesFromBase64(base64: string, max = 2048): Uint8Array {
  const clean = (base64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const chars = Math.ceil((max * 4) / 3 / 4) * 4;
  try {
    // atob はブラウザにも Node にもある（Buffer を使わない＝画面側から import しても壊れない）
    const bin = atob(clean.slice(0, chars));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}
