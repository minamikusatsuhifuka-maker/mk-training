// 育成カルテ・わたしの可能性ノートの印刷用表示（指示書195）— 純粋部
//   項目の定義・既定のON/OFF・誰が選べるか（B）。実際の表示範囲はサーバー（/api/growth/print）が画面と同じ権限判定で絞る。

export const PRINT_SECTIONS = [
  { key: "position", label: "現在地（図・合意と自己評価の位置・次に伸ばす軸）", defaultOn: true, adminOnly: false },
  { key: "transition", label: "次の移行（必須の学び・到達状態と根拠）", defaultOn: true, adminOnly: false },
  { key: "goals", label: "目標（目的〜週）", defaultOn: true, adminOnly: false },
  { key: "oneonone", label: "1on1の約束・フィードバック", defaultOn: true, adminOnly: false },
  { key: "learning", label: "学びの記録", defaultOn: true, adminOnly: false },
  { key: "survey", label: "公開されたサーベイ", defaultOn: true, adminOnly: false },
  { key: "timeline", label: "成長年表", defaultOn: false, adminOnly: false },
  { key: "hiring", label: "採用資料・経歴（院長のみ）", defaultOn: false, adminOnly: true },
  { key: "scouter", label: "スカウター（院長のみ）", defaultOn: false, adminOnly: true },
  { key: "contacts", label: "連絡先・家族構成（院長のみ）", defaultOn: false, adminOnly: true },
] as const;
export type PrintSectionKey = (typeof PRINT_SECTIONS)[number]["key"];
export const isPrintSectionKey = (v: unknown): v is PrintSectionKey => PRINT_SECTIONS.some((s) => s.key === v);
export const printSectionLabel = (k: PrintSectionKey) => PRINT_SECTIONS.find((s) => s.key === k)?.label ?? k;

export type PrintRole = "admin" | "self" | "delegate";

/**
 * その立場で印刷に含められる項目（画面と同じ範囲）
 *  - 院長: すべて
 *  - 本人: 現在地・次の移行・目標・1on1の約束と自分がもらったFB・学び・公開サーベイ・年表（本人が画面で見られる範囲）
 *  - 担当幹部: 目標・1on1の約束と自分が記録したFB・学び・公開サーベイ・年表（183/185の範囲。現在地は190で本人と院長のみ）
 */
export function allowedPrintSections(role: PrintRole): PrintSectionKey[] {
  if (role === "admin") return PRINT_SECTIONS.map((s) => s.key);
  const common: PrintSectionKey[] = ["goals", "oneonone", "learning", "survey", "timeline"];
  return role === "self" ? ["position", "transition", ...common] : common;
}

export function defaultPrintSections(role: PrintRole): PrintSectionKey[] {
  const allowed = allowedPrintSections(role);
  return PRINT_SECTIONS.filter((s) => s.defaultOn && allowed.includes(s.key)).map((s) => s.key);
}

/** ?sections=a,b,c を読み、不正な語を落とす（順序は定義順） */
export function parsePrintSections(raw: string | null | undefined): PrintSectionKey[] {
  const set = new Set((raw ?? "").split(",").map((s) => s.trim()).filter(isPrintSectionKey));
  return PRINT_SECTIONS.map((s) => s.key).filter((k) => set.has(k));
}

/** 印刷物の1ページ目の注記（確定版と同じ趣旨） */
export const PRINT_NOTE = "移行はチェックの数ではなく対話で合意します。点数・順位・他者との比較はありません。";
export const PRINT_CONFIDENTIAL = "取扱注意（院内限り）";
export const PRINT_BROWSER_HINT = "ブラウザの印刷設定で『ヘッダーとフッター』をオフにしてください";
