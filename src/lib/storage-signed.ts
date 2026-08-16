// Storage の署名付きURL発行（指示書163・サーバー専用）
//
// 【なぜ必要か】
// 資料庫のファイルは公開バケット（staff-photos）＋公開URLで配信していた。
// 指示書161で塞いだのはページとAPIで、**ストレージのURLはその関門の外側にある**。
// URLさえ知っていれば、ログインしていなくても誰でも実体に到達できた。
//
// 【方式】132-B（イベント写真）と同じに揃える。
// 非公開バケット＋**認証を確認したうえで発行する署名付きURL**（有効期間1時間）。
// 作法が2つに分かれないよう、TTLも events-server.ts と同値にしている。
//
// 【既存データを書き換えないための工夫】
// DBには公開URL（.../object/public/staff-photos/xxx）が**文字列で保存済み**で、
// 資料庫・プロフィール写真・サーベイ画像の3機能にまたがって散っている。
// これを一括で書き換えるのは危険（歯止め2: 本番データの破壊的操作をしない）なので、
// **読み出しのたびに公開URLからパスを逆算し、署名URLに差し替えて返す**。
// 保存されている値はそのまま。バケットを非公開に戻すだけで移行が完了し、
// 元に戻したくなればこの層を外すだけで済む。
//
// 【fail-close】
// 署名の発行に失敗したら**空文字を返す**（公開URLにフォールバックしない）。
// フォールバックすると、非公開化の意味が失われる。

import { STAFF_PHOTOS_BUCKET } from "./staff-profiles";
import type { createSupabaseAdminClient } from "./supabase-admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * 署名URLの有効期間（秒）。
 * 資料庫・プロフィール写真（163）とイベント写真（132-B/165）で**唯一の値**。
 * 指示書165 §3-3「作法を2つに分けない」に従い、ここ以外に TTL を持たせない。
 */
export const SIGNED_URL_TTL = 3600;

/** 公開URLの目印。この後ろがバケット内のパス */
const PUBLIC_MARKER = `/storage/v1/object/public/${STAFF_PHOTOS_BUCKET}/`;

/**
 * バケットそのものが未作成であることの判定（指示書165）。
 *
 * 【なぜ必要か】165で分かったこと: バケットが無いときの Supabase の応答は
 * 「Bucket not found」であって、権限エラーとは区別がつかない見た目になる。
 * 165以前はこれを握りつぶしていたため、画面には何も出ず**原因に辿り着けなかった**。
 * 未作成だと分かったときだけ、専用の日本語メッセージに差し替えるために使う。
 */
export function isBucketNotFound(message: string | null | undefined): boolean {
  return /bucket not found/i.test(message ?? "");
}

/**
 * 指定バケットのパス群に署名URLをまとめて発行する（**署名の唯一の入口**）。
 *
 * - 1回のAPI呼び出しでまとめて発行する（件数分の往復をしない）
 * - fail-close: 失敗したものは Map に入らない＝呼び出し側で空文字に倒す
 * - bucketMissing: バケット未作成だったかどうか（画面に理由を出すため）
 */
export async function signBucketPaths(
  admin: AdminClient,
  bucket: string,
  paths: readonly string[]
): Promise<{ urls: Map<string, string>; bucketMissing: boolean }> {
  const urls = new Map<string, string>();
  const uniq = Array.from(new Set(paths.filter(Boolean)));
  if (uniq.length === 0) return { urls, bucketMissing: false };

  try {
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrls(uniq, SIGNED_URL_TTL);
    if (error || !data) {
      return { urls, bucketMissing: isBucketNotFound(error?.message) };
    }
    for (const d of data) {
      if (d.signedUrl && !d.error) urls.set(d.path as string, d.signedUrl);
    }
  } catch {
    /* fail-close: 空のまま返す */
  }
  return { urls, bucketMissing: false };
}

/**
 * 保存済みの公開URLから Storage のパスを取り出す。
 * 公開URLでない（外部リンク・空文字・署名URL済み）ものは null。
 */
export function storagePathFromPublicUrl(url: string): string | null {
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx < 0) return null;
  const path = decodeURIComponent(url.slice(idx + PUBLIC_MARKER.length).split("?")[0]);
  return path || null;
}

/**
 * URLの配列を、署名URLへ差し替えた Map（元URL → 署名URL）にして返す。
 *
 * - 公開URLでないものは対象外（外部リンクはそのまま使わせる）
 * - 1回のAPI呼び出しでまとめて発行する（件数分の往復をしない）
 * - 発行できなかったものは Map に入らない＝呼び出し側で空文字に倒す
 */
export async function signPublicUrls(
  admin: AdminClient,
  urls: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // 元URL → パス（重複はまとめる）
  const pathByUrl = new Map<string, string>();
  for (const url of urls) {
    const path = storagePathFromPublicUrl(url);
    if (path) pathByUrl.set(url, path);
  }
  const paths = Array.from(new Set(pathByUrl.values()));
  if (paths.length === 0) return out;

  // 署名の実処理は signBucketPaths に一本化（165 §3-3）
  const { urls: signedByPath } = await signBucketPaths(
    admin,
    STAFF_PHOTOS_BUCKET,
    paths
  );
  for (const [url, path] of pathByUrl) {
    const signed = signedByPath.get(path);
    if (signed) out.set(url, signed);
  }
  return out;
}

/**
 * 1件だけ署名する（まとめて発行できない場面用）。
 * 公開URLでなければ元の値をそのまま返す（外部リンクを壊さないため）。
 */
export async function signOne(
  admin: AdminClient,
  url: string
): Promise<string> {
  if (!storagePathFromPublicUrl(url)) return url;
  const map = await signPublicUrls(admin, [url]);
  return map.get(url) ?? "";
}
