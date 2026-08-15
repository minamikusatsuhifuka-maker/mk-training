// サーベイ結果の公開判定（指示書164）— 型以外に依存しない純関数
//
// ここを1ファイルに独立させている理由:
//   ・判定は「見せる場所」ではなく「渡す前」に行う。呼び出し元はサーバーAPIだが、
//     ロジック自体はDBにもStorageにも依存しないので、純関数として切り離せる。
//   ・依存が無いぶん、この判定だけを単体で検証できる。
//     公開範囲の判定は間違えたときの影響が大きいため、検証しやすさを優先した。

import type { StaffProfile } from "./staff-profiles";

// ─── サーベイ結果の公開判定（指示書164）───
//
// 5つの基本的欲求のプロフィールは業務スキルではなく、
// **その人が何によって満たされるかという内面の傾向**である。
// 選択理論の趣旨としては共有されたほうが機能するが、同じ情報は
// 「あの人は扱いにくい」という見方にも転じうる。本人には防ぎようがない。
// よって **本人が公開を選んだものだけを他の人に見せる**（146-Eの誕生日と同じ線）。
//
// 【なぜサーバーで削ぐのか】
// 164以前は、公開判定が **メンバー紹介の画面（クライアント）だけ**で行われており、
// サーバーは全員分のサーベイ結果をそのまま返していた。
// 画面に出ていなくても、応答の中身を見れば非公開の人の結果が読める状態だった。
// **見せない判断は、見せる場所ではなく渡す前に行う。**
//
// 【管理者も例外にしない】
// 本人の同意に基づく公開である以上、権限で覗ける余地を残すと同意の意味が薄れる。
// 管理者が見られる前提だと、公開を選ぶ判断そのものが変わってしまう（164-1-3）。
//
// 【fail-close】
// visibility が未設定・想定外の値・壊れている場合はすべて非公開として扱う。
// 既にアップロード済みの人は「非公開のつもり」で出している可能性が高いため、
// 既存データを書き換えず、**未設定＝非公開**で始める（164-3-3）。

/** 本人以外に見せてよいサーベイか（public と明示されているときだけ true） */
function isSurveyVisibleTo(p: StaffProfile, viewerUserId: string): boolean {
  if (p.userId === viewerUserId) return true; // 本人は常に見られる
  return p.needsSurvey?.visibility === "public";
}

/**
 * 閲覧者に見せてよい形へプロフィールを削ぐ（164）。
 * 非公開のサーベイは **needsSurvey ごと落とす**。
 * 「非公開です」と伝える情報も残さない＝誰が公開していないか分からない
 * （分かる形にすると公開への同調圧力になる・164-3-2）。
 */
export function redactProfileForViewer(
  p: StaffProfile,
  viewerUserId: string
): StaffProfile {
  if (isSurveyVisibleTo(p, viewerUserId)) return p;
  // キーごと落とす（undefined を入れるのではなく、そもそも項目を作らない）
  const rest: Partial<StaffProfile> = { ...p };
  delete rest.needsSurvey;
  return rest as StaffProfile;
}

export function redactProfilesForViewer(
  profiles: StaffProfile[],
  viewerUserId: string
): StaffProfile[] {
  return profiles.map((p) => redactProfileForViewer(p, viewerUserId));
}
