// 画像のメタデータ（位置情報・撮影機種・日時など）を消す（指示書228 §2-2）— 純関数・依存なし
//
// 【二重にしている理由】画像は端末で一度描き直してから送る（canvas で描き直すとメタデータは付かない）。
//   ただ、それは画面側の約束にすぎないので、**サーバーでも必ずここを通してから保存する**
//   （APIを直接呼ばれても位置情報が残らない）。
//
// 【消すもの】
//   JPEG … APP1（Exif・XMP）／APP13（IPTC）／APP2 のうち ICC 以外（MPF＝iPhoneの付属画像の目次）／
//           APP3〜APP12・APP15／COM（コメント）／終わりの印（EOI）より後ろ（付属画像。中に Exif を持つ）
//   PNG  … eXIf／tEXt／zTXt／iTXt／tIME、IEND より後ろ
//   WebP … EXIF／XMP チャンク（VP8X の印も外す）
// 【残すもの】色の情報（JPEG の APP0・APP2 ICC・APP14、PNG の iCCP など）と画像の本体。
// 向き（Exif の Orientation）は端末で描き直すときに反映済み＝消しても向きは変わらない。

export type StripResult = {
  bytes: Uint8Array;
  /** 消したものの名前（記録・確認用） */
  removed: string[];
};

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...Array.from(b.subarray(start, Math.min(b.length, start + len))));

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ─── JPEG ───

export function stripJpeg(b: Uint8Array): StripResult {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new Error("JPEGとして読み取れません");
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  const removed: string[] = [];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("JPEGの区切りが読み取れません");
    // 詰め物の FF を飛ばす
    let m = i + 1;
    while (m < b.length && b[m] === 0xff) m++;
    if (m >= b.length) break;
    const marker = b[m];
    const segStart = i;
    i = m + 1;
    if (marker === 0xd9) {
      // EOI：ここで終わり（後ろに付いている付属画像は捨てる）
      parts.push(new Uint8Array([0xff, 0xd9]));
      if (i < b.length) removed.push("EOI以降の付属データ");
      return { bytes: concat(parts), removed };
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(segStart, i));
      continue;
    }
    if (i + 2 > b.length) throw new Error("JPEGが途中で切れています");
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) throw new Error("JPEGの区切りの長さが読み取れません");
    const segEnd = i + len;
    let drop = false;
    let label = "";
    if (marker === 0xe1) {
      drop = true;
      label = ascii(b, i + 2, 4) === "Exif" ? "Exif" : "XMP/APP1";
    } else if (marker === 0xe2) {
      // ICC だけ残す（MPF などは捨てる）
      if (ascii(b, i + 2, 11) !== "ICC_PROFILE") {
        drop = true;
        label = ascii(b, i + 2, 3) === "MPF" ? "MPF" : "APP2";
      }
    } else if (marker === 0xed) {
      drop = true;
      label = "IPTC/APP13";
    } else if ((marker >= 0xe3 && marker <= 0xec) || marker === 0xef) {
      drop = true;
      label = `APP${marker - 0xe0}`;
    } else if (marker === 0xfe) {
      drop = true;
      label = "COM";
    }
    if (drop) removed.push(label);
    else parts.push(b.subarray(segStart, segEnd));
    i = segEnd;
    if (marker === 0xda) {
      // SOS：この後ろは画像の本体。次の区切り（FF00 と RST 以外）まで丸ごと写す
      let j = i;
      while (j < b.length) {
        if (b[j] === 0xff && j + 1 < b.length) {
          const n = b[j + 1];
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) break;
        }
        j++;
      }
      parts.push(b.subarray(i, j));
      i = j;
    }
  }
  // EOI が無いまま終わった（壊れかけ）。読めた分だけ返す
  return { bytes: concat(parts), removed };
}

// ─── PNG ───

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function stripPng(b: Uint8Array): StripResult {
  if (b.length < 8 || b[0] !== 0x89 || ascii(b, 1, 3) !== "PNG") throw new Error("PNGとして読み取れません");
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) throw new Error("PNGが途中で切れています");
    if (PNG_DROP.has(type)) removed.push(type);
    else parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      if (i < b.length) removed.push("IEND以降のデータ");
      break;
    }
  }
  return { bytes: concat(parts), removed };
}

// ─── WebP ───

export function stripWebp(b: Uint8Array): StripResult {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") throw new Error("WebPとして読み取れません");
  const chunks: Uint8Array[] = [];
  const removed: string[] = [];
  let i = 12;
  let vp8xIndex = -1;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | ((b[i + 7] << 24) >>> 0);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) throw new Error("WebPが途中で切れています");
    if (type === "EXIF" || type === "XMP ") {
      removed.push(type.trim());
    } else {
      if (type === "VP8X") vp8xIndex = chunks.length;
      chunks.push(b.slice(i, Math.min(end, b.length)));
    }
    i = end;
  }
  if (vp8xIndex >= 0 && removed.length > 0) {
    // VP8X の「Exifあり(0x08)・XMPあり(0x04)」の印を外す
    chunks[vp8xIndex][8] &= ~(0x08 | 0x04);
  }
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 4), 0);
  const riffSize = body.length + 4;
  head[4] = riffSize & 0xff;
  head[5] = (riffSize >> 8) & 0xff;
  head[6] = (riffSize >> 16) & 0xff;
  head[7] = (riffSize >>> 24) & 0xff;
  head.set(b.subarray(8, 12), 8);
  return { bytes: concat([head, body]), removed };
}

/** 種類に合わせて消す。mime は "image/jpeg" | "image/png" | "image/webp" */
export function stripImageMetadata(bytes: Uint8Array, mime: string): StripResult {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  if (mime === "image/webp") return stripWebp(bytes);
  throw new Error("この画像の形式は保存できません");
}

/** 確認用: メタデータらしきもの（Exif・XMP・GPS）が残っているか */
export function hasImageMetadata(bytes: Uint8Array): boolean {
  const s = ascii(bytes, 0, Math.min(bytes.length, 1 << 20));
  // WebP の EXIF チャンクは "EXIF"＋長さ4バイト＋TIFFの頭（II* / MM*）
  return /Exif\0\0|<x:xmpmeta|http:\/\/ns\.adobe\.com\/xap|eXIf|EXIF[\s\S]{4}(II\*|MM\0\*)/.test(s);
}
