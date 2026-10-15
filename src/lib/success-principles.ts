// 🌱 成長の行動例（成功の原則×行動例・考え方の例）と 今週の一歩 — 純関数・依存なし
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。
//
// 【文言】本文は docs/success-principles/*.md の行そのもの（success-principles-data-server.ts・ログイン中のスタッフにだけ API が返す）。
//   スタッフ向けのデータには「問い：」「1on1の問い：」「※」の行が入っていない（生成の時点で外している）。
// 【検索】画面の中だけで行う（外部サービス・AIに渡さない）。
// 【今週の一歩】見られるのは本人だけ（Supabase の RLS：auth.uid() 一致）。件数・達成率などの集計はつくらない。

export type SuccessLineKind = "meaning" | "action" | "thought" | "sign" | "overcome";

export type SuccessLine = {
  kind: SuccessLineKind;
  /** .md の行そのもの（頭の「- 」「意味：」「考え方：」などを外したもの） */
  text: string;
  /** 考え方：「つい浮かぶ考え方」→「成長につながる考え方」の前と後 */
  before?: string;
  after?: string;
};

export type SuccessItem = { id: string; title: string; lines: SuccessLine[] };
export type SuccessCategory = { id: string; title: string; items: SuccessItem[] };
export type SuccessStaffData = {
  /** 冒頭の注記（ライブラリの上部に出す） */
  note: string;
  /** 0. 土台（本文と表をそのまま Markdown で） */
  foundation: { id: string; title: string; markdown: string };
  categories: SuccessCategory[];
};

/** 「今週の一歩にする」を出す行（行動例・乗り越える行動・考え方） */
export function isStepable(kind: SuccessLineKind): boolean {
  return kind === "action" || kind === "overcome" || kind === "thought";
}

/** 行の頭に付ける小さな名前（.md の頭の言葉そのまま） */
export const LINE_LABEL: Partial<Record<SuccessLineKind, string>> = {
  meaning: "意味",
  sign: "サイン",
  overcome: "乗り越える行動",
  thought: "考え方",
};

// ─── 検索（画面の中だけ） ───

export type SuccessHit = {
  categoryId: string;
  categoryTitle: string;
  /** 項目（0. 土台は見出しの区切り） */
  itemId: string;
  itemTitle: string;
  /** 前後の文（該当語のまわり） */
  before: string;
  match: string;
  after: string;
};

const CONTEXT = 24;

function hitsIn(text: string, q: string): { at: number }[] {
  const out: { at: number }[] = [];
  if (!q) return out;
  let i = text.indexOf(q);
  while (i >= 0 && out.length < 3) {
    out.push({ at: i });
    i = text.indexOf(q, i + q.length);
  }
  return out;
}

function around(text: string, at: number, len: number) {
  const s = Math.max(0, at - CONTEXT);
  const e = Math.min(text.length, at + len + CONTEXT);
  return {
    before: (s > 0 ? "…" : "") + text.slice(s, at).replace(/\s+/g, " "),
    match: text.slice(at, at + len),
    after: text.slice(at + len, e).replace(/\s+/g, " ") + (e < text.length ? "…" : ""),
  };
}

/** 0. 土台の Markdown を「### 」で区切る（検索の行き先にする） */
export function foundationParts(md: string): { id: string; title: string; body: string }[] {
  const out: { id: string; title: string; body: string }[] = [];
  let cur: { id: string; title: string; body: string[] } | null = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("### ")) {
      if (cur) out.push({ id: cur.id, title: cur.title, body: cur.body.join("\n") });
      cur = { id: `c0-${out.length + 1}`, title: line.slice(4), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) out.push({ id: cur.id, title: cur.title, body: cur.body.join("\n") });
  return out;
}

/** 全項目の本文をキーワードで探す。categoryId を渡すとそのカテゴリーだけ */
export function searchSuccess(data: SuccessStaffData, query: string, categoryId = ""): SuccessHit[] {
  const q = query.trim();
  if (!q) return [];
  const out: SuccessHit[] = [];
  if (!categoryId || categoryId === data.foundation.id) {
    for (const p of foundationParts(data.foundation.markdown)) {
      for (const text of [p.title, p.body]) {
        for (const h of hitsIn(text, q)) {
          out.push({ categoryId: data.foundation.id, categoryTitle: data.foundation.title, itemId: p.id, itemTitle: p.title, ...around(text, h.at, q.length) });
        }
      }
    }
  }
  for (const c of data.categories) {
    if (categoryId && c.id !== categoryId) continue;
    for (const it of c.items) {
      for (const text of [it.title, ...it.lines.map((l) => l.text)]) {
        for (const h of hitsIn(text, q)) {
          out.push({ categoryId: c.id, categoryTitle: c.title, itemId: it.id, itemTitle: it.title, ...around(text, h.at, q.length) });
        }
      }
    }
  }
  return out;
}

// ─── 今週の一歩の期間（選んだ日から次の日曜日まで・日本時間の日付 YYYY-MM-DD） ───

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 期間の終わり＝「次の日曜日」。月〜土に選べばその週の日曜日、日曜日に選べば翌週の日曜日。
 */
export function stepEndFor(startYmd: string): string {
  const dow = new Date(`${startYmd}T00:00:00Z`).getUTCDay(); // 0=日
  return addDaysYmd(startYmd, dow === 0 ? 7 : 7 - dow);
}

export type WeeklyStep = {
  id: string;
  text: string;
  /** 選んだもと（カテゴリー › 項目）。自由記述なら空 */
  source: string;
  start_on: string;
  end_on: string;
  /** 期間の終わりに自分で選ぶ（未記録は null） */
  result: "done" | "more" | null;
  memo: string;
  created_at?: string;
  updated_at?: string;
};

export const STEP_TEXT_MAX = 300;
export const STEP_MEMO_MAX = 200;
export const RESULT_LABEL: Record<"done" | "more", string> = { done: "できた", more: "もう少し" };

/** 今日がその一歩の期間の中か */
export function isActiveStep(s: Pick<WeeklyStep, "start_on" | "end_on">, today: string): boolean {
  return s.start_on <= today && today <= s.end_on;
}

/** 期間が終わった（ふり返りができる） */
export function isEndedStep(s: Pick<WeeklyStep, "end_on">, today: string): boolean {
  return s.end_on < today;
}

/** 「10月15日（水）〜10月19日（日）」 */
export function stepPeriodLabel(s: Pick<WeeklyStep, "start_on" | "end_on">): string {
  const W = ["日", "月", "火", "水", "木", "金", "土"];
  const f = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${W[d.getUTCDay()]}）`;
  };
  return `${f(s.start_on)}〜${f(s.end_on)}`;
}
