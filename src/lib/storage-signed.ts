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

/** 署名URLの有効期間（秒）。132-B のイベント写真と同値 */
export const SIGNED_URL_TTL = 3600;

/** 公開URLの目印。この後ろがバケット内のパス */
const PUBLIC_MARKER = `/storage/v1/object/public/${STAFF_PHOTOS_BUCKET}/`;

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

  try {
    const { data, error } = await admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (error || !data) return out; // fail-close（空のまま返す）
    const signedByPath = new Map(
      data
        .filter((d) => d.signedUrl && !d.error)
        .map((d) => [d.path as string, d.signedUrl as string])
    );
    for (const [url, path] of pathByUrl) {
      const signed = signedByPath.get(path);
      if (signed) out.set(url, signed);
    }
  } catch {
    /* fail-close: 空のまま返す */
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
