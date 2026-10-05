// 「準備中」の機能を中の人だけ開けるようにする判定（指示書203 §1・191-補）— サーバー専用
//
// 【なぜサーバーで判定するか（203 §1）】
// 「院長なら開ける」をブラウザの中だけで決めると、画面のJSを書き換えれば誰でも開けてしまう。
// 役割（app_metadata.role）と検証用の印（app_metadata.test_seed）は**サーバーだけが読める**
// セッションから取り出し、結果（開けるか・どの機能が準備中か）だけを画面に渡す。
//
// 【何を変えないか】
// ・保存された機能フラグ（content_store portal_feature_flags）は**書き換えない**。
//   スタッフから見える状態は何も変わらない（「準備中」のまま）。
// ・新しい機能フラグは作らない。
// ・ページの公開スイッチ（page_*・既定ON・指示書124）は触らない。
//
// クライアントから import しないこと（/api/feature-flags 経由で使う）。

import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import {
  getFeatureFlags,
  previewFeatureIds,
  previewReasonFor,
  withPreviewOverride,
  type FeatureFlags,
  type FeatureId,
  type PreviewReason,
} from "./feature-flags";

export type ViewerFlags = {
  /** 画面が使うフラグ（プレビューの人は実装済みの機能がONに倒れている） */
  flags: FeatureFlags;
  /** プレビューで開けているか */
  preview: boolean;
  previewReason: PreviewReason;
  /** 保存はOFFだが、プレビューで開けている機能（帯を出す対象） */
  previewIds: FeatureId[];
};

/**
 * いまログインしている人の立場で、機能フラグを解決する。
 * 未ログインなら null（呼び出し側が401にする）。
 */
export async function viewerFeatureFlags(): Promise<ViewerFlags | null> {
  const { user } = await getSessionUser();
  if (!user) return null;
  const stored = await getFeatureFlags();
  // 判定の規則は feature-flags.ts の previewReasonFor（純関数・単体で確かめられる）
  const previewReason: PreviewReason = previewReasonFor({
    isAdmin: isAdminUser(user),
    testSeed: isTestSeedUser(user),
  });
  const preview = previewReason !== "";
  return {
    flags: withPreviewOverride(stored, preview),
    preview,
    previewReason,
    previewIds: previewFeatureIds(stored, preview),
  };
}
