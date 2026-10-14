// 可能性ノート「欲求の視点（関わる側のヒント）」の判定（純関数・依存なし）
//
// 【守ること】
//   ・判定（高い欲求／低い欲求／φ／頑張りすぎ／やり方の見直し）は**保存しない**。表示のたびにここで計算するだけ。
//   ・他のスタッフとの比較・順位・平均は計算しない（1人の結果の中だけで並べる）。
//   ・欲求の結果も判定も、どのAI処理にも渡さない（このファイルを AI の呼び出しから import しない）。
//   ・ガイドの文言は needs-guide-data.ts（docs/needs-guide/*.md から機械的に作ったもの）だけを使う。
//
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。

export type NeedCategory = "survival" | "belonging" | "power" | "freedom" | "fun";

export type NeedsGuideSide = {
  signs: string[];
  growth: string[];
  development: string[];
  phrases: string[];
  avoid: string[];
  note?: string[];
};

export type NeedsGuideItem = {
  /** 指示書のキー（anzen_antei など15） */
  key: string;
  /** 診断結果の保存キー（needs-survey.ts の NEED_DETAIL_ITEMS: safety など） */
  surveyKey: string;
  name: string;
  category: NeedCategory;
  /** 意味（.md の行そのまま・改行区切り） */
  meaning: string;
  high: NeedsGuideSide;
  low: NeedsGuideSide;
  /** STEP3-1 4章「最初の一言」 */
  firstQuestion: string;
};

export type NeedsGuideHint = { category: NeedCategory; title: string; items: string[] };

/** カードの欄の見出し（.md の小見出しと同じ言い方） */
export const NEEDS_GUIDE_SECTION_LABELS: { key: keyof NeedsGuideSide; label: string }[] = [
  { key: "signs", label: "表れ" },
  { key: "growth", label: "成長支援" },
  { key: "development", label: "能力開発" },
  { key: "phrases", label: "声かけ例" },
  { key: "avoid", label: "避けたい関わり" },
  { key: "note", label: "注意" },
];

/** 「頑張りすぎ」「やり方の見直し」のしきい値（指示書 §5・ここ1か所で変える） */
export const NEEDS_PATTERN_THRESHOLD = 20;
/** 高い欲求・低い欲求の数（232で見出しを「高い欲求」「低い欲求」に） */
export const NEEDS_TOP_COUNT = 3;

/** 区画の上部に常に出す注意（指示書 §6 の文のまま） */
export const NEEDS_PERSPECTIVE_NOTICE =
  "欲求に優劣はありません。評価や配置の判断には使いません。他の人と比べず、本人の言葉で確かめてください。可能性ノートには、推測やラベル（「〇〇欲求が強いから」など）を書かないでください。";

export type DetailValues = { desire?: number; focus?: number; current?: number };

export type NeedsPerspective = {
  /** 本人の中で「欲求」が高い上位3（項目キー） */
  strong: string[];
  /** 本人の中で「欲求」が低い下位3（高い欲求と重ならない） */
  weak: string[];
  /** 「欲求 − 現実」が最も大きい項目（φ）。現実の値が無ければ null */
  phi: string | null;
  /** 「注力 − 欲求」がしきい値以上 */
  overwork: string[];
  /** 「注力」が「欲求」以上で、「欲求 − 現実」がしきい値以上 */
  rethink: string[];
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * 1人の診断結果（surveyKey → 欲求・注力・現実）から判定する。
 * items はガイドの並び（同点はこの並びが先のものを上にする＝毎回同じ結果）。
 * phiMark は診断結果にφの印がある場合（あればそれを優先）。
 */
export function computeNeedsPerspective(
  details: Record<string, DetailValues | undefined>,
  items: readonly Pick<NeedsGuideItem, "key" | "surveyKey">[],
  opts: { threshold?: number; phiMark?: string | null } = {}
): NeedsPerspective {
  const th = opts.threshold ?? NEEDS_PATTERN_THRESHOLD;
  const rows = items
    .map((it, order) => ({ key: it.key, order, v: details[it.surveyKey] ?? {} }))
    .filter((r) => num(r.v.desire));

  const byDesireDesc = rows.slice().sort((a, b) => (b.v.desire as number) - (a.v.desire as number) || a.order - b.order);
  const strong = byDesireDesc.slice(0, NEEDS_TOP_COUNT).map((r) => r.key);
  const byDesireAsc = rows
    .filter((r) => !strong.includes(r.key))
    .sort((a, b) => (a.v.desire as number) - (b.v.desire as number) || a.order - b.order);
  const weak = byDesireAsc.slice(0, NEEDS_TOP_COUNT).map((r) => r.key);

  let phi: string | null = null;
  if (opts.phiMark && items.some((i) => i.key === opts.phiMark)) {
    phi = opts.phiMark;
  } else {
    let best = -Infinity;
    for (const r of rows) {
      if (!num(r.v.current)) continue;
      const gap = (r.v.desire as number) - r.v.current;
      if (gap > best) {
        best = gap;
        phi = r.key;
      }
    }
    // 欲求が現実を上回る項目が無ければ「最優先で聴く」差は無い
    if (best <= 0) phi = null;
  }

  const overwork = rows
    .filter((r) => num(r.v.focus) && r.v.focus - (r.v.desire as number) >= th)
    .map((r) => r.key);
  const rethink = rows
    .filter(
      (r) =>
        num(r.v.focus) &&
        num(r.v.current) &&
        r.v.focus >= (r.v.desire as number) &&
        (r.v.desire as number) - r.v.current >= th
    )
    .map((r) => r.key);

  return { strong, weak, phi, overwork, rethink };
}

/** 気になるパターンに当たった項目のカテゴリー（読み方のヒントを出すため・ガイドの並び順） */
export function patternCategories(
  p: Pick<NeedsPerspective, "overwork" | "rethink">,
  items: readonly Pick<NeedsGuideItem, "key" | "category">[]
): NeedCategory[] {
  const hit = new Set([...p.overwork, ...p.rethink]);
  const out: NeedCategory[] = [];
  for (const it of items) {
    if (hit.has(it.key) && !out.includes(it.category)) out.push(it.category);
  }
  return out;
}

/** 文中の **太字** を分ける（表示用。文字は変えない） */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}
