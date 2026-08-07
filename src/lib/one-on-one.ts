// 1on1ノート（指示書112・機能ID one_on_one）— 型・定数・正規化・回IDヘルパ
// - データは private_store のみ（content_type "one_on_one"・record_key=回ID）。
//   アクセスは private-store-client.ts 経由（listInvolved で参加分込みの一覧）。
// - 閲覧は本人＋ペア相手＋管理者のみ（判定はAPIサーバー側・指示書112）。
//   記録者のみ編集・削除可（ペア相手は閲覧のみ＝基盤の既定がそのまま実現）。
// - 提出/ロックの概念なし・物理削除・リアクションなし
//   （リアクションは content_store=公開領域のため、機微文脈の存在をメタデータとして漏らさない）。

import { jstTodayYmd } from "./library";
import { normalizeJitsuChecks } from "./jitsu-checklist";

export type OneOnOneData = {
  heldOn: string; // 実施日 "YYYY-MM-DD"（必須）
  participantIds: string[]; // ペア相手の userId（当面1名。配列は将来の3者面談等への含み）
  partnerName: string; // 相手の表示名（記録時点を保存）
  authorName: string; // 記録者の表示名（記録時点を保存）
  sections: {
    theme: string; // 話したテーマ
    kizuki: string; // 気づき・学び
    nextStep: string; // 次の一歩
  };
  /**
   * 152: 「7つの実チェック」で選ばれた項目のid配列（**この回ごと**に保存）。
   * 文言ではなくidで持つ（文言を直しても過去の回のチェックが変わらないため）。
   * 回を重ねると成長の履歴になるので、過去回のデータは書き換えない。
   */
  jitsuChecks: string[];
  createdAt: string;
  updatedAt: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeHeldOnYmd(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function emptyOneOnOneData(): OneOnOneData {
  return {
    heldOn: "",
    participantIds: [],
    partnerName: "",
    authorName: "",
    sections: { theme: "", kizuki: "", nextStep: "" },
    jitsuChecks: [],
    createdAt: "",
    updatedAt: "",
  };
}

export function normalizeOneOnOneData(raw: unknown): OneOnOneData {
  const base = emptyOneOnOneData();
  if (!raw || typeof raw !== "object") return base;
  const g = raw as Record<string, unknown>;
  const s = (g.sections && typeof g.sections === "object" ? g.sections : {}) as Record<
    string,
    unknown
  >;
  const createdAt = str(g.createdAt);
  return {
    heldOn: normalizeHeldOnYmd(g.heldOn),
    participantIds: Array.isArray(g.participantIds)
      ? g.participantIds.filter((v): v is string => typeof v === "string" && !!v)
      : [],
    partnerName: str(g.partnerName),
    authorName: str(g.authorName),
    sections: {
      theme: str(s.theme),
      kizuki: str(s.kizuki),
      nextStep: str(s.nextStep),
    },
    jitsuChecks: normalizeJitsuChecks(g.jitsuChecks),
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
  };
}

// 回ID（record_key）: 日付＋ランダム6字（例 "20260729-a1b2c3"）。RECORD_KEY_RE に適合
export function genOneOnOneKey(): string {
  const ymd = jstTodayYmd().replaceAll("-", "");
  return `${ymd}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 画面文言（指示書112の指定どおり） ───

export const ONE_ON_ONE_INTRO =
  "1on1は、評価の場ではなく、伴走の時間です。話したテーマ・気づき・次の一歩を記録して、二人の歩みを確かめ合いましょう。記録が見られるのは、本人・ペアの相手・院長だけです。";

export const ONE_ON_ONE_EMPTY =
  "まだ記録がありません。次の1on1から、残してみましょう。";

export const PARTNER_NOTE =
  "相手に選べるのは、ポータルに登録済みのメンバーです。";

export const ONE_ON_ONE_SECTIONS: {
  key: keyof OneOnOneData["sections"];
  label: string;
}[] = [
  { key: "theme", label: "話したテーマ" },
  { key: "kizuki", label: "気づき・学び" },
  { key: "nextStep", label: "次の一歩" },
];

// 表示用: 実施日降順（同日は作成日時降順）
export function sortOneOnOne<T extends { data: unknown }>(
  records: T[]
): T[] {
  return records.slice().sort((a, b) => {
    const da = normalizeOneOnOneData(a.data);
    const db = normalizeOneOnOneData(b.data);
    return (
      (db.heldOn || "").localeCompare(da.heldOn || "") ||
      (db.createdAt || "").localeCompare(da.createdAt || "")
    );
  });
}
