// 事前アンケートの回答を時期ごとに横に並べて比べる（指示書214 §2）— 純関数
//
// 【比べるもの】**1人のスタッフの、時期ごとの回答どうし**だけ（214 §0-4）。
//   ほかのスタッフとの比較・並べ替え・集計・点数化はしない（204 §5-2・§5-4を引き継ぐ）。
//
// 【並び】列は左が古い回答、右が新しい回答。行は問いごとにそろえる。
//   ・同じ問い（questionId が同じ）は同じ行
//   ・いまの質問に無い問い（197の q3・q4 など）は「旧形式の問い」と添えた行にする
//   ・その回に無い欄は「無い」ことが分かるようにする（画面では「—」）
//
// 【変わった答えの印】左の列と中身が違う欄に印を付ける。
//   **空白だけの違いは無視**する（改行・全角空白を詰めて比べる）。
//   左の欄が「無い」ときは印を付けない（比べる元が無いので「変わった」と言えない）。
//
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。
// 回答の型は one-on-one-presurvey.ts の PresurveyAnswer と同じ形を構造的に受け取る。

/** 第1部／第2部／旧形式（0） */
export type ComparePart = 0 | 1 | 2;

/** 回答1件（PresurveyAnswer と同じ形のうち、比較に使う分だけ） */
export type CompareAnswerLike = {
  questionId: string;
  question: string;
  part: number;
  choice: string;
  text: string;
  unchanged: boolean;
};

/** 1回の回答（1on1の回ごと） */
export type CompareEntryLike = {
  recordKey: string;
  /** 1on1の実施予定日 */
  heldOn: string;
  submittedAt: string;
  updatedAt: string;
  /** 2部構成の回答か（false＝197の9問の旧形式） */
  twoParts: boolean;
  answers: CompareAnswerLike[];
};

/** 横に並べられる最大の件数（214 §2。4つ目は選べない） */
export const PRESURVEY_COMPARE_MAX = 3;

export type CompareColumn = {
  recordKey: string;
  heldOn: string;
  submittedAt: string;
  twoParts: boolean;
};

export type CompareCell = {
  /** その回にこの問いの回答があるか（false＝画面では「—」） */
  present: boolean;
  /** 選んだ言葉 */
  choice: string;
  /** 書いた文 */
  text: string;
  /** 「変わりない」を選んだ（197の goal_confirm・carry_over） */
  unchanged: boolean;
  /** 左の列から変わったか（空白だけの違いは無視・左が無い欄なら false） */
  changed: boolean;
};

export type CompareRow = {
  questionId: string;
  /** 問いの文（新しい回の保存文を優先する） */
  question: string;
  part: ComparePart;
  /** いまの質問には無く、旧形式の回答にしかない問いか */
  legacyOnly: boolean;
  cells: CompareCell[];
};

export type PresurveyComparison = {
  columns: CompareColumn[];
  rows: CompareRow[];
};

/** 空白（半角・全角・改行）を詰める。「空白だけの違い」を無視するため */
function squeeze(v: string): string {
  return (v || "").replace(/[\s　]+/g, "");
}

/** 欄の中身の比較キー（選んだ言葉・書いた文・「変わりない」をまとめて1本に） */
export function cellCompareKey(c: Pick<CompareCell, "choice" | "text" | "unchanged">): string {
  return `${squeeze(c.choice)}\u0001${squeeze(c.text)}\u0001${c.unchanged ? "1" : "0"}`;
}

/** その欄に中身があるか（選んだ言葉も書いた文も「変わりない」も無ければ空） */
export function isEmptyCell(c: Pick<CompareCell, "choice" | "text" | "unchanged">): boolean {
  return !squeeze(c.choice) && !squeeze(c.text) && !c.unchanged;
}

function partOf(v: number): ComparePart {
  return v === 1 ? 1 : v === 2 ? 2 : 0;
}

/** 古い回答 → 新しい回答の順（同じ日は提出日時→更新日時） */
export function sortCompareEntriesAsc<
  T extends Pick<CompareEntryLike, "heldOn" | "submittedAt" | "updatedAt" | "recordKey">,
>(entries: readonly T[]): T[] {
  return entries.slice().sort(
    (a, b) =>
      (a.heldOn || "").localeCompare(b.heldOn || "") ||
      (a.submittedAt || "").localeCompare(b.submittedAt || "") ||
      (a.updatedAt || "").localeCompare(b.updatedAt || "") ||
      a.recordKey.localeCompare(b.recordKey)
  );
}

/** 新しい回答 → 古い回答の順（一覧の並び） */
export function sortCompareEntriesDesc<
  T extends Pick<CompareEntryLike, "heldOn" | "submittedAt" | "updatedAt" | "recordKey">,
>(entries: readonly T[]): T[] {
  return sortCompareEntriesAsc(entries).reverse();
}

/**
 * 最初に選ぶ回答（214 §2）＝「最新」と「その前」の2つ。
 * 新しい順に並んだ一覧を渡す。1件しかなければその1件だけ。
 */
export function defaultCompareKeys(entriesDesc: readonly { recordKey: string }[]): string[] {
  return entriesDesc.slice(0, 2).map((e) => e.recordKey);
}

/** 選び直し（最大3件まで。4つ目は選べない＝選択を変えない） */
export function toggleCompareKey(selected: readonly string[], recordKey: string): string[] {
  if (selected.includes(recordKey)) return selected.filter((k) => k !== recordKey);
  if (selected.length >= PRESURVEY_COMPARE_MAX) return selected.slice();
  return [...selected, recordKey];
}

/** これ以上選べないか（4つ目の候補を押せなくするため） */
export function isCompareFull(selected: readonly string[]): boolean {
  return selected.length >= PRESURVEY_COMPARE_MAX;
}

/**
 * 横並びの表を組む。
 * @param entries 並べる回答（順番は問わない。この中で古い→新しいに並べ替える）
 * @param currentQuestionIds いまの質問（表示中のもの）のid。並びの基準になり、
 *        ここに無い問いは「旧形式の問い」として後ろに回す。空なら旧形式の判定をしない。
 */
export function buildPresurveyComparison(
  entries: readonly CompareEntryLike[],
  currentQuestionIds: readonly string[] = []
): PresurveyComparison {
  const cols = sortCompareEntriesAsc(entries).slice(0, PRESURVEY_COMPARE_MAX);
  const columns: CompareColumn[] = cols.map((e) => ({
    recordKey: e.recordKey,
    heldOn: e.heldOn,
    submittedAt: e.submittedAt,
    twoParts: e.twoParts,
  }));

  // 問いごとに、列の数だけ欄を並べる
  const byQuestion = new Map<string, (CompareAnswerLike | null)[]>();
  const appeared: string[] = [];
  cols.forEach((entry, i) => {
    for (const a of entry.answers) {
      const id = (a.questionId || "").trim();
      if (!id) continue;
      let slots = byQuestion.get(id);
      if (!slots) {
        slots = cols.map(() => null);
        byQuestion.set(id, slots);
        appeared.push(id);
      }
      // 同じ回に同じ問いが二度あれば、あとの1件を使う（保存の重複に耐える）
      slots[i] = a;
    }
  });

  const currentSet = new Set(currentQuestionIds);
  const ordered: string[] = [];
  for (const id of currentQuestionIds) if (byQuestion.has(id)) ordered.push(id);
  for (const id of appeared) if (!currentSet.has(id)) ordered.push(id);

  const rows: CompareRow[] = ordered.map((id) => {
    const slots = byQuestion.get(id) ?? [];
    // 問いの文と部は、新しい列に保存されているものを優先する
    let question = "";
    let part: ComparePart = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
      const a = slots[i];
      if (!a) continue;
      if (!question && a.question.trim()) question = a.question;
      if (part === 0 && partOf(a.part) !== 0) part = partOf(a.part);
    }
    const cells: CompareCell[] = slots.map((a) => ({
      present: a !== null,
      choice: a?.choice ?? "",
      text: a?.text ?? "",
      unchanged: a?.unchanged === true,
      changed: false,
    }));
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const cur = cells[i];
      if (!prev.present || !cur.present) continue;
      cur.changed = cellCompareKey(prev) !== cellCompareKey(cur);
    }
    return {
      questionId: id,
      question,
      part,
      legacyOnly: currentSet.size > 0 && !currentSet.has(id),
      cells,
    };
  });

  return { columns, rows };
}

/** 部ごとの見出し（表の中の区切り。既存の回答の画面と同じ呼び方） */
export const COMPARE_PART_TITLE: Record<ComparePart, string> = {
  1: "第1部　働く目的と目標",
  2: "第2部　今回の1on1",
  0: "（2部構成より前の回答）",
};

/** 表の中の部の並び（第1部 → 第2部 → 旧形式） */
export const COMPARE_PART_ORDER: ComparePart[] = [1, 2, 0];

/** 旧形式の問いに添える言葉（214 §2） */
export const COMPARE_LEGACY_NOTE = "旧形式の問い";
