// 検証用の1on1の記録例（指示書203 §2）— **純粋データだけ**（importしない）
//
// なぜ切り出すか: 本番のDBに入れる値を、そのまま機械的に確かめられるようにするため。
//   ・文章の末尾が「（検証用）」になっているか
//   ・7つの実のidが実在するか・1〜2項目か
//   ・実施日が並びどおりか／既存の回（6/1・9/1）の内容が変わっていないか
//   ・事前アンケートの回答が、いまの質問（q1〜q9）に収まるか
// 実際に書き込むのは test-seed-run-server.ts（service-role）。ここは値の正本。
//
// 【既存の検証用データは変えない（203 §2）】
// 6/1・9/1 の記録（NOTE_20260601 / NOTE_20260901）は191のままの文言。
// テスト花子の10/13の予定と、その未回答の事前アンケートは**ここに入れない**
// （院長が197の知らせ・回答を自分で試すため、未回答のまま残す）。

/** 文章の末尾に付ける印（203 §2） */
export const SEED203_SUFFIX = "（検証用）";

/** 1on1ノートの「クイックメモ」の3欄（112）。RWDEPCの5欄はクイックメモでは画面に出ないので使わない */
export type Seed203Sections = {
  /** 話したテーマ */
  theme: string;
  /** 気づき・学び */
  kizuki: string;
  /** 次の一歩（約束） */
  nextStep: string;
};

export type Seed203Note = {
  /** 回ID（private_store の record_key） */
  key: string;
  /** 実施日 */
  heldOn: string;
  /** 記録者（"director"＝院長／"jiro"＝テスト次郎が幹部として記録） */
  author: "director" | "jiro";
  /** 1on1を受けた人 */
  staff: "hanako" | "jiro";
  sections: Seed203Sections;
  /** 7つの実チェック（この回の内容と矛盾しないものを1〜2項目だけ） */
  jitsuChecks: string[];
  /** 本人の取り組み状況（179 C） */
  promise: { status: "not_started" | "in_progress" | "done"; note: string };
  /** 191から入っている回か（内容を変えてはいけない） */
  existing?: true;
};

export const SEED203_NOTES: readonly Seed203Note[] = [
  // ── 191から入っている2回（内容を変えない） ──
  {
    key: "20260601-seed01",
    heldOn: "2026-06-01",
    author: "director",
    staff: "hanako",
    sections: {
      theme: "入職2か月の振り返り（検証用）",
      kizuki: "報連相のタイミングに迷いがある",
      nextStep: "迷ったら5分以内に先輩に声をかける",
    },
    jitsuChecks: [],
    promise: { status: "done", note: "先輩に声をかけられるようになった（検証用）" },
    existing: true,
  },
  {
    key: "20260901-seed02",
    heldOn: "2026-09-01",
    author: "director",
    staff: "hanako",
    sections: {
      theme: "上期の振り返り（検証用）",
      kizuki: "処置の準備が早くなった",
      nextStep: "次の1on1までに処置手順書を1つ作る",
    },
    jitsuChecks: [],
    promise: { status: "in_progress", note: "手順書を下書き中（検証用）" },
    existing: true,
  },

  // ── 203 §2-1 テスト花子（記録者：院長） ──
  {
    key: "20260707-seed03",
    heldOn: "2026-07-07",
    author: "director",
    staff: "hanako",
    sections: {
      theme:
        "入職1か月の近況。「早く一人で受付を回せるようになりたい」という想いを確認（検証用）",
      kizuki:
        "予約電話の聞き取り漏れが2回あった。本人の分析は「メモを取る順番が決まっていない」（検証用）",
      nextStep:
        "予約電話のメモの型（氏名→診察券番号→希望日時→症状）を作って使う。7月中（検証用）",
    },
    // 「聞き取り漏れを自分から報告した」「自分の成長課題を自覚している」に当たるものだけ
    jitsuChecks: ["seijitsu-03", "jitsugen-20"],
    promise: { status: "done", note: "「型を作ってからは聞き漏れなし」（検証用）" },
  },
  {
    key: "20260804-seed04",
    heldOn: "2026-08-04",
    author: "director",
    staff: "hanako",
    sections: {
      theme:
        "受付で「安心して帰っていただける人になりたい」という本人の想い（検証用）",
      kizuki:
        "混雑時、待ち時間の長い方への声かけが後回しになっていた、と本人が気づいた。「声をかけた日は、会計のときの表情が違う」（検証用）",
      nextStep: "待ち時間が30分を超えた方に、自分から一声かける。毎日・2週間（検証用）",
    },
    jitsuChecks: ["jikko-08", "ketsujitsu-05"],
    promise: {
      status: "done",
      note: "「2週間続けられた。意識しなくてもできる日が増えた」（検証用）",
    },
  },

  // ── 203 §2-2 テスト次郎（記録者：院長） ──
  {
    key: "20260915-seed05",
    heldOn: "2026-09-15",
    author: "director",
    staff: "jiro",
    sections: {
      theme: "処置介助の幅を広げたい（検証用）",
      kizuki: "「準備物の確認を先輩に頼っている」と本人が自己評価（検証用）",
      nextStep:
        "処置ごとの準備物チェック表を作り、先輩に確認してもらってから自分で準備する。10月中（検証用）",
    },
    jitsuChecks: ["seijitsu-02", "jitsugen-20"],
    promise: { status: "in_progress", note: "チェック表は完成、先輩の確認待ち（検証用）" },
  },

  // ── 203 §2-4 幹部の記録（テスト次郎は183でテスト花子の担当幹部に指定されている） ──
  {
    key: "20260922-seed06",
    heldOn: "2026-09-22",
    author: "jiro",
    staff: "hanako",
    sections: {
      theme: "受付と処置室の連携（検証用）",
      kizuki: "受付で聞いた希望が処置室に伝わりきらないことがある（検証用）",
      nextStep: "処置室に回す前に、受付で患者さんの希望を一言メモに残す（検証用）",
    },
    jitsuChecks: ["seijitsu-18"],
    promise: { status: "in_progress", note: "" },
  },
];

// ─── テスト次郎の次回1on1の予定と、回答済みの事前アンケート（203 §2-2） ───

export const SEED203_JIRO_SCHEDULE = {
  /** 179のテーブルの行id */
  id: "seed191-j-schedule-1020",
  date: "2026-10-20",
  /** 時刻は指示書に無いので空（「10月20日（火）　院長と」と出る） */
  time: "",
  /** 登録日。知らせの時点の判定に使う（回答済みなので知らせは出ない） */
  registeredOn: "2026-10-01",
  at: "2026-10-01T09:00:00.000Z",
} as const;

export const SEED203_JIRO_PRESURVEY_KEY = "20261020-seed07";
export const SEED203_JIRO_PRESURVEY_AT = "2026-10-01T09:30:00.000Z";

/**
 * 事前アンケートの回答（203 §2-2 の9項目）。
 * キーは質問id（197-補の既定 q1〜q9）。choice はその質問の選択肢に実在するときだけ使う
 * （院長が選択肢を直していても壊れないように、書き込み側で確かめる）。
 */
export const SEED203_JIRO_ANSWERS: Record<string, { choice?: string; text?: string }> = {
  q1: { text: "準備を一人でできるようになった報告と、次に覚えたい処置について（検証用）" },
  q2: { text: "チェック表を使い始めてから、9月後半は準備漏れなし（検証用）" },
  q3: { choice: "変わった", text: "年内に、主な処置5種類の介助を一人で担当する（検証用）" },
  q4: { text: "処置室の新人に教えられる立場になっている（検証用）" },
  q5: { choice: "実現できそう", text: "研修と先輩の伴走があるので（検証用）" },
  q6: {
    choice: "できた",
    text: "チェック表を作って先輩に確認してもらう → 確認まで終わった（検証用）",
  },
  q7: { choice: "なっている", text: "準備の時間が短くなり、介助に集中できている（検証用）" },
  q8: {
    text: "光線治療の操作を先輩の横で3回確認し、手順を自分の言葉でまとめる（検証用）",
  },
  q9: { text: "光線治療の操作を見学できる時間を週1回ほしい（検証用）" },
};

/** 191の初版の約束の行id（203で promiseStatusId 形式に統一するため片付ける） */
export const SEED203_LEGACY_PROMISE_IDS: readonly string[] = [
  "seed191-h-promise-1",
  "seed191-h-promise-2",
];
