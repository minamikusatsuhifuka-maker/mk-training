// 年次 自己評価シート（指示書111・機能ID self_review）— 型・定数・正規化・評価期設定
// - シート本体は private_store（content_type "self_review"・record_key=評価期）に保存。
//   アクセスは private-store-client.ts のみ（content_store・anon直読みは一切使わない）。
// - これは採点表ではなく、面談で院長と対話するための準備シート。全項目、空のまま保存・提出可
//   （必須項目は設けない・紙シートv3の「すべて埋めなくても構いません」を踏襲）。
// - 評価期の名称（機微でない）だけは content_store の self_review_config に置き、管理画面から設定する。
// - 見出し・補足文言はこのファイルに集約し、スタッフ側ページと管理側の全文表示で共用する。

import { loadPortalObject, savePortalObject } from "./portal-store";
import { RECORD_KEY_RE } from "./private-store-client";

// ─── シート本体の型 ───

export type SelfReviewStatus = "draft" | "submitted";
export type SelfReviewRank = "S" | "A" | "B" | "C" | "";

export type SelfReviewData = {
  status: SelfReviewStatus;
  grade: string; // "G1"〜"G5" | ""（本人申告）
  name: string; // 保存時点のプロフィール名を記録
  period_label: string; // 評価期ラベル（例 "2026年度"）
  filled_at: string; // 提出時に記録するISO日時（下書き中は ""）
  sections: {
    minori: {
      jikkou: string;
      jisseki: string;
      jitsuryoku: string;
      jitsugen: string;
      juujitsu: string;
      seijitsu: string;
      ketsujitsu: string;
    };
    arikata: { kansha: string; seijitsu: string; wakachiai: string };
    output: { done: string; kizuki: string; next: string };
    rank: { value: SelfReviewRank; reason: string };
    raiki: { wants: string; doing: string; support: string };
  };
};

export function emptySelfReviewData(): SelfReviewData {
  return {
    status: "draft",
    grade: "",
    name: "",
    period_label: "",
    filled_at: "",
    sections: {
      minori: {
        jikkou: "",
        jisseki: "",
        jitsuryoku: "",
        jitsugen: "",
        juujitsu: "",
        seijitsu: "",
        ketsujitsu: "",
      },
      arikata: { kansha: "", seijitsu: "", wakachiai: "" },
      output: { done: "", kizuki: "", next: "" },
      rank: { value: "", reason: "" },
      raiki: { wants: "", doing: "", support: "" },
    },
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// private_store から読んだ data の正規化（欠落フィールドは空で補完・未知は無視）
export function normalizeSelfReviewData(raw: unknown): SelfReviewData {
  const base = emptySelfReviewData();
  if (!raw || typeof raw !== "object") return base;
  const g = raw as Record<string, unknown>;
  const s = (g.sections && typeof g.sections === "object" ? g.sections : {}) as Record<
    string,
    unknown
  >;
  const sec = <T extends Record<string, string>>(
    key: string,
    tmpl: T
  ): T => {
    const src = (s[key] && typeof s[key] === "object" ? s[key] : {}) as Record<
      string,
      unknown
    >;
    const out = { ...tmpl };
    for (const k of Object.keys(tmpl) as (keyof T)[]) {
      out[k] = str(src[k as string]) as T[keyof T];
    }
    return out;
  };
  const rankSrc = (s.rank && typeof s.rank === "object" ? s.rank : {}) as Record<
    string,
    unknown
  >;
  const rankValue = str(rankSrc.value);
  return {
    status: g.status === "submitted" ? "submitted" : "draft",
    grade: GRADES.includes(str(g.grade)) ? str(g.grade) : "",
    name: str(g.name),
    period_label: str(g.period_label),
    filled_at: str(g.filled_at),
    sections: {
      minori: sec("minori", base.sections.minori),
      arikata: sec("arikata", base.sections.arikata),
      output: sec("output", base.sections.output),
      rank: {
        value: (RANK_VALUES as readonly string[]).includes(rankValue)
          ? (rankValue as SelfReviewRank)
          : "",
        reason: str(rankSrc.reason),
      },
      raiki: sec("raiki", base.sections.raiki),
    },
  };
}

// ─── 画面文言（紙シートv3・指示書111の指定どおり） ───

export const SELF_REVIEW_INTRO =
  "これは採点表ではありません。あなたの1年を『実（じつ）＝事実・数字・具体的な場面』で振り返り、面談で院長と対話するための準備シートです。うまく書けなくて大丈夫。ありのままで結構です。";

export const MINORI_INTRO =
  "それぞれ、事実・数字・具体的な場面で書いてみましょう。すべて埋めなくても構いません。";

export const MINORI_ITEMS: {
  key: keyof SelfReviewData["sections"]["minori"];
  label: string;
  hint: string;
}[] = [
  { key: "jikkou", label: "実行（じっこう）", hint: "決めたことをやりきったこと" },
  { key: "jisseki", label: "実績（じっせき）", hint: "事実・数字で語れる成果" },
  { key: "jitsuryoku", label: "実力（じつりょく）", hint: "再現できる技術・知識・在り方" },
  { key: "jitsugen", label: "実現（じつげん）", hint: "ビジョンに向けて学び続けたこと" },
  { key: "juujitsu", label: "充実（じゅうじつ）", hint: "内側から満ちて働けた場面" },
  { key: "seijitsu", label: "誠実（せいじつ）", hint: "言行を一致させられたこと" },
  { key: "ketsujitsu", label: "結実（けつじつ）", hint: "継続が形になったこと" },
];

export const ARIKATA_ITEMS: {
  key: keyof SelfReviewData["sections"]["arikata"];
  label: string;
  hint: string;
}[] = [
  { key: "kansha", label: "感謝", hint: "環境・仲間・出来事への感謝" },
  { key: "seijitsu", label: "誠実", hint: "相手の幸せを願い、言行一致" },
  { key: "wakachiai", label: "分かち愛", hint: "違いを受容し、学びを分かち合う" },
];

export const OUTPUT_ITEMS: {
  key: keyof SelfReviewData["sections"]["output"];
  label: string;
}[] = [
  { key: "done", label: "今期のアウトプット（場・テーマ・対象）" },
  { key: "kizuki", label: "アウトプットで深まった気づき" },
  { key: "next", label: "次に試したいアウトプット" },
];

export const RANK_INTRO =
  "下の表は、等級ごとに『どこを主に見るか』の重心です。点数を計算する式ではなく、対話の重心です。";

export const RANK_QUESTION =
  "いまの等級の『重心』に照らして、自分はどのランクだと思いますか？";

export const RANK_REASON_LABEL =
  "そう考える理由（重心・7つの実・在り方に照らして）";

export const RANK_NOTE =
  "※ ランクは、面談の対話をふまえて合意します。チェックの数で機械的に決めるものではありません。年数は問いません。";

// 等級重心表（参考表示・静的）
export const GRADE_AXIS_TABLE: {
  grade: string;
  era: string;
  weight: string;
  summary: string;
}[] = [
  { grade: "G1 ルーキー", era: "技能の時代", weight: "4：4：2", summary: "まず技能。在り方は芽生え" },
  { grade: "G2 コア", era: "技能の時代", weight: "3：3：4", summary: "在り方が前に出始める" },
  { grade: "G3 リーダー ★", era: "在り方の時代", weight: "2：3：5", summary: "在り方が半分。理念の体現者へ" },
  { grade: "G4 パートナー", era: "在り方の時代", weight: "2：2：6", summary: "在り方が中心。組織の水質を守る" },
  { grade: "G5 アンバサダー", era: "在り方の時代", weight: "1：1：8", summary: "ほぼ在り方だけ。背中で見せる" },
];

export const RAIKI_ITEMS: {
  key: keyof SelfReviewData["sections"]["raiki"];
  label: string;
}[] = [
  { key: "wants", label: "いちばん伸ばしたい実は？（WANTS）" },
  { key: "doing", label: "そのために何をしますか？（DOING / PLANNING）" },
  { key: "support", label: "クリニックに支援してほしいこと" },
];

export const GRADES = ["G1", "G2", "G3", "G4", "G5"];
export const RANK_VALUES = ["S", "A", "B", "C"] as const;

export const SUBMIT_CONFIRM =
  "提出すると院長が閲覧でき、編集できなくなります。面談の前に提出してください。";

export const SUBMITTED_NOTE =
  "提出済みです。修正が必要な場合は院長にお声がけください。";

// ─── 評価期設定（content_store・機微でない名称のみ） ───

export const SELF_REVIEW_CONFIG_KEY = "self_review_config";

export type SelfReviewConfig = {
  currentPeriod: string; // record_key（/^[\w.-]{1,64}$/ に適合）
  label: string; // 表示ラベル（例 "2026年度"）
};

export const DEFAULT_SELF_REVIEW_CONFIG: SelfReviewConfig = {
  currentPeriod: "2026",
  label: "2026年度",
};

export async function loadSelfReviewConfig(): Promise<SelfReviewConfig> {
  const obj = await loadPortalObject<Partial<SelfReviewConfig> | null>(
    SELF_REVIEW_CONFIG_KEY,
    null
  );
  const currentPeriod = str(obj?.currentPeriod);
  if (!RECORD_KEY_RE.test(currentPeriod)) {
    return { ...DEFAULT_SELF_REVIEW_CONFIG };
  }
  return {
    currentPeriod,
    label: str(obj?.label) || currentPeriod,
  };
}

export async function saveSelfReviewConfig(
  config: SelfReviewConfig
): Promise<boolean> {
  if (!RECORD_KEY_RE.test(config.currentPeriod)) return false;
  return savePortalObject(SELF_REVIEW_CONFIG_KEY, {
    currentPeriod: config.currentPeriod,
    label: config.label.trim() || config.currentPeriod,
  });
}
