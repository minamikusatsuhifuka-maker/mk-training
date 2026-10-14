// 人材育成研修（欲求別成長支援ガイド STEP3-2）— 純関数・定数（クライアント・サーバー両方から import できる）

/** 指定・解除の記録（操作ログ）の種類と対象。/api/admin/delegation が書き、/api/admin/people-training が院長に返す */
export const PEOPLE_TRAINING_LOG_KIND = "人材育成研修の受講者";
export const PEOPLE_TRAINING_LOG_TARGET = "人材育成研修";

/** ガイドの画面のパス（カテゴリー・見出しを指定して開く） */
export const NEEDS_GUIDE_PATH = "/admin/people-training/guide";
export function guideHref(docId?: string, sectionId?: string): string {
  const q = new URLSearchParams();
  if (docId) q.set("doc", docId);
  if (sectionId) q.set("sec", sectionId);
  const s = q.toString();
  return s ? `${NEEDS_GUIDE_PATH}?${s}` : NEEDS_GUIDE_PATH;
}
