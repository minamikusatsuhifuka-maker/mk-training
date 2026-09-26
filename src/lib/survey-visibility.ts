// サーベイ結果の公開判定（指示書164 → 182で3択に）— 型以外に依存しない純関数
//
// ここを1ファイルに独立させている理由:
//   ・判定は「見せる場所」ではなく「渡す前」に行う。呼び出し元はサーバーAPIだが、
//     ロジック自体はDBにもStorageにも依存しないので、純関数として切り離せる。
//   ・依存が無いぶん、この判定だけを単体で検証できる。
//     公開範囲の判定は間違えたときの影響が大きいため、検証しやすさを優先した。
//
// ─── 公開範囲（182 A-1）───
//
// | 設定             | 本人以外（管理者を含む）に渡すもの                              |
// |------------------|-----------------------------------------------------------------|
// | private（既定）  | 何も渡さない（needsSurvey ごと落とす）                          |
// | public           | 5欲求の点数（レーダー）・結果画像・回答日                       |
// | public_details   | 上に加えて 詳細15項目の「欲求（desire）」の値                   |
//
// 「注力（focus）」「現況（current）」は**どの設定でも本人以外に渡さない**（182 A-1）。
//
// 【182 A-2: 既存の「公開」は「レーダーと画像」として扱う】
// 181の調査で、公開者の詳細15項目がメンバー紹介で全員に見えている一方、本人への説明は
// 「レーダーチャートと画像」だけだった。よって既存の "public" は詳細を**渡さない**方向に倒し、
// 詳細も見せてよい人は本人が "public_details" を選び直す（閉じる方向＝デプロイ時点で詳細が消える）。
//
// 【管理者も例外にしない】（164-1-3）
// 【fail-close】visibility が未設定・想定外・壊れている場合はすべて非公開。

import type { StaffProfile } from "./staff-profiles";
import { NEED_DETAIL_ITEMS, radarValuesOf, type NeedsSurvey } from "./needs-survey";

/**
 * 本人以外の閲覧者に渡してよい形へサーベイを削ぐ。
 * 渡してよいものが無ければ null（呼び出し側はキーごと落とす）。
 */
export function redactSurveyForViewer(survey: NeedsSurvey | undefined | null): NeedsSurvey | null {
  if (!survey) return null;
  const v = survey.visibility;
  if (v !== "public" && v !== "public_details") return null;

  // レーダーの点数: メンバー紹介と同じ算出（values が無ければ詳細の「欲求」平均で補完）。
  // 詳細を落としても同じレーダーが描けるよう、ここで点数に固めて渡す。
  const values = radarValuesOf(survey);
  const out: NeedsSurvey = {
    visibility: v,
    updatedAt: survey.updatedAt ?? "",
    ...(survey.imageUrl ? { imageUrl: survey.imageUrl } : {}),
    ...(Object.keys(values).length > 0 ? { values } : {}),
  };

  if (v === "public_details" && survey.details) {
    // 「欲求」だけ。注力・現況はどの設定でも渡さない
    const details: NonNullable<NeedsSurvey["details"]> = {};
    for (const item of NEED_DETAIL_ITEMS) {
      const d = survey.details[item.key];
      if (d && typeof d.desire === "number") details[item.key] = { desire: d.desire };
    }
    if (Object.keys(details).length > 0) out.details = details;
  }
  return out;
}

/**
 * 閲覧者に見せてよい形へプロフィールを削ぐ（164 → 182）。
 * 本人は常にすべて見られる。本人以外には redactSurveyForViewer の結果だけを渡す。
 * 非公開は **needsSurvey ごと落とす**（「非公開です」と伝える情報も残さない＝同調圧力を作らない・164-3-2）。
 */
export function redactProfileForViewer(
  p: StaffProfile,
  viewerUserId: string
): StaffProfile {
  if (p.userId === viewerUserId) return p; // 本人は常に見られる
  const rest: Partial<StaffProfile> = { ...p };
  delete rest.needsSurvey;
  const shared = redactSurveyForViewer(p.needsSurvey);
  if (shared) rest.needsSurvey = shared;
  return rest as StaffProfile;
}

export function redactProfilesForViewer(
  profiles: StaffProfile[],
  viewerUserId: string
): StaffProfile[] {
  return profiles.map((p) => redactProfileForViewer(p, viewerUserId));
}
