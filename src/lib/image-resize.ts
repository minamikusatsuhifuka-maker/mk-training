"use client";

// 画像をクライアント側で canvas リサイズして JPEG Blob にする（アップロード前の縮小用）。
// アバター: 長辺512px / 共有写真: 長辺1600px

export const AVATAR_MAX_EDGE = 512;
export const PHOTO_MAX_EDGE = 1600;

export async function resizeImageToJpeg(
  file: File,
  maxEdge: number,
  quality = 0.85
): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("画像を読み込めませんでした（対応していない形式の可能性があります）");
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を初期化できませんでした");
  // JPEG は透過非対応のため白背景で塗る（PNG透過→黒化を防ぐ）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("画像の変換に失敗しました");
  return blob;
}
