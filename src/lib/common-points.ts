// 共通点バッジ（指示書46R-C）
// ログイン中ユーザーの自分のプロフィールと他メンバーのプロフィールをクライアント側で比較する。
// 判定:
//   - hometown の都道府県一致
//   - hobbies（基本項目）・favorite_food・hooked・holiday の読点・中黒・空白分割トークン完全一致
//   - 役職一致（同じ職種）
// 表示は /members のカード（最大2個）と詳細ダイアログ（全件）。commonPoints OFF で非表示。

import type { StaffProfile } from "./staff-profiles";

export type CommonPoint = {
  key: string; // フィールドid または "hometown_pref" / "role"
  label: string;
  values: string[]; // 一致した内容（バッジ・詳細の表示用）
};

// トークン一致で比較するフィールド（hobbies は基本項目、他はカスタム項目の既定id）
const TOKEN_FIELDS: { id: string; fallbackLabel: string }[] = [
  { id: "hobbies", fallbackLabel: "趣味・特技" },
  { id: "favorite_food", fallbackLabel: "好きな食べ物" },
  { id: "hooked", fallbackLabel: "最近ハマっていること" },
  { id: "holiday", fallbackLabel: "休日の過ごし方" },
];

// "滋賀県" "東京都" "京都府" "北海道" を抽出（見つからなければ null）
export function extractPrefecture(text: string): string | null {
  const m = /(東京都|北海道|京都府|大阪府|[一-龠々]{2,3}県)/.exec(text);
  return m ? m[1] : null;
}

// 読点・中黒・カンマ・スラッシュ・空白・改行で分割した正規化トークン集合
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .split(/[、。,．・･\/／\s]+/u)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2) // 1文字トークン（「犬」等は許容したいが誤爆が多いため2文字以上）
  );
}

function fieldValue(p: StaffProfile, id: string): string {
  if (id === "hobbies") return p.hobbies ?? "";
  // 🔒（private）のカスタム項目は共通点の判定対象からも除外する（指示書52）
  if (p.customFieldsPrivacy?.[id] === "private") return "";
  return p.customFields?.[id] ?? "";
}

// 自分(mine)と相手(other)の共通点を列挙する（出身地→トークン項目→役職の順）。
// labelOf: カスタム項目idの表示ラベル解決（profile_field_config 由来。無ければfallback）
export function computeCommonPoints(
  mine: StaffProfile,
  other: StaffProfile,
  labelOf?: (id: string) => string | undefined
): CommonPoint[] {
  const points: CommonPoint[] = [];

  // 出身地（都道府県）
  const myPref = extractPrefecture(fieldValue(mine, "hometown"));
  const otherPref = extractPrefecture(fieldValue(other, "hometown"));
  if (myPref && otherPref && myPref === otherPref) {
    points.push({
      key: "hometown_pref",
      label: labelOf?.("hometown") ?? "出身地",
      values: [myPref],
    });
  }

  // トークン完全一致
  for (const f of TOKEN_FIELDS) {
    const a = tokenize(fieldValue(mine, f.id));
    if (a.size === 0) continue;
    const b = tokenize(fieldValue(other, f.id));
    const hit = [...a].filter((t) => b.has(t));
    if (hit.length > 0) {
      points.push({
        key: f.id,
        label: (f.id !== "hobbies" ? labelOf?.(f.id) : undefined) ?? f.fallbackLabel,
        values: hit,
      });
    }
  }

  // 役割（同じ職種）
  if (mine.role && other.role && mine.role === other.role) {
    points.push({ key: "role", label: "役割（職種）", values: [mine.role] });
  }

  return points;
}
