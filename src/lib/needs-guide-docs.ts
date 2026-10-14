// 欲求別成長支援ガイド・人材育成研修の表示と検索（管理画面）— 純関数・依存なし
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。
//
// 【文言】本文は docs/needs-guide/*.md の中身そのもの（needs-guide-docs-server.ts・サーバーが見られる人にだけ返す）。
//   ここでは見出しで区切るだけで、文は1字も変えない（表示は Markdown のまま）。
// 【タブ】STEP2 の「## 項目N」の下にある「### 欲求が強い人」「### 欲求が低い人」は、タブで切り替える。
// 【検索】画面の中だけで行う（外部サービス・AIに渡さない）。

export type NeedsGuideDocKind = "guide" | "training";
export type NeedsGuideDoc = {
  id: string;
  /** カテゴリーの名前（例「生存の欲求」） */
  label: string;
  kind: NeedsGuideDocKind;
  /** 正本のファイル名（例「欲求別成長支援ガイド_STEP2-1_生存の欲求_20261014.md」） */
  file: string;
  /** .md の中身そのまま */
  markdown: string;
};

export type GuideTab = "high" | "low";
export const GUIDE_TAB_TITLES: Record<GuideTab, string> = { high: "欲求が強い人", low: "欲求が低い人" };

export type GuideSection = {
  /** 画面の中の位置（アンカー） */
  id: string;
  level: number;
  /** 見出しの文（先頭の # を除いたもの） */
  title: string;
  /** 見出しの次の行から、次の見出しの前まで（.md の行そのまま） */
  body: string;
  /** 1つ上の見出し（## の下の ### なら、その ##） */
  parentId: string | null;
  /** 「欲求が強い人／低い人」のタブ（項目の下だけ） */
  tab: GuideTab | null;
};

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** STEP の名前（ファイル名から。例「STEP2-1」） */
export function stepOf(doc: Pick<NeedsGuideDoc, "file">): string {
  return doc.file.match(/STEP\d(?:-\d)?/)?.[0] ?? "";
}

/** 一覧に出すカテゴリー名「生存の欲求（STEP2-1）」 */
export function docTitle(doc: Pick<NeedsGuideDoc, "file" | "label">): string {
  const step = stepOf(doc);
  return step ? `${doc.label}（${step}）` : doc.label;
}

/** 見出しで区切る。見出しの前の行（あれば）は、見出しなしの区切り（level 0）にする */
export function splitSections(doc: Pick<NeedsGuideDoc, "id" | "markdown">): GuideSection[] {
  const lines = doc.markdown.split("\n");
  const out: GuideSection[] = [];
  let title = "";
  let level = 0;
  let body: string[] = [];
  let inFence = false;
  const stack: { level: number; id: string }[] = [];
  const flush = () => {
    if (level === 0 && body.join("").trim() === "") return;
    const id = `${doc.id}-s${out.length}`;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    const parentId = level > 0 && stack.length > 0 ? stack[stack.length - 1].id : null;
    out.push({ id, level, title, body: body.join("\n").replace(/\n+$/, ""), parentId, tab: null });
    if (level > 0) stack.push({ level, id });
  };
  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const m = inFence ? null : line.match(HEADING_RE);
    if (m) {
      flush();
      level = m[1].length;
      title = m[2].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  // 「項目」の下の「欲求が強い人」「欲求が低い人」をタブにする
  const byId = new Map(out.map((s) => [s.id, s]));
  for (const s of out) {
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    if (!parent || !/^項目\d+/.test(parent.title)) continue;
    if (s.title === GUIDE_TAB_TITLES.high) s.tab = "high";
    else if (s.title === GUIDE_TAB_TITLES.low) s.tab = "low";
  }
  return out;
}

/** 目次に出す見出し（## と ###。タブの中身は項目の見出しにまとめる） */
export function tocOf(sections: GuideSection[]): GuideSection[] {
  return sections.filter((s) => (s.level === 2 || s.level === 3) && s.tab === null);
}

/** 検索・前後の文に使う、Markdown の印を外した文（太字の ** ・行頭の - や番号・表の | ・見出しの #） */
export function plainOf(markdown: string): string {
  return markdown
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/, "") // 表の区切り行
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/\*\*/g, "")
        .replace(/\s*\|\s*/g, " ")
        .trim()
    )
    .filter((l) => l !== "")
    .join(" ");
}

export type SearchHit = {
  docId: string;
  sectionId: string;
  /** 「カテゴリー › 見出し」 */
  path: string;
  before: string;
  match: string;
  after: string;
  tab: GuideTab | null;
};

const SNIPPET = 32;

/** 見出しの道筋（例「力の欲求（STEP2-3） › 項目6　承認 › 欲求が強い人」） */
export function pathOf(doc: NeedsGuideDoc, sections: GuideSection[], section: GuideSection): string {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const names: string[] = [];
  let cur: GuideSection | undefined = section;
  while (cur) {
    // 文書の題（# と STEP の ##）は、カテゴリー名に含まれるので道筋に入れない
    if (cur.level >= 2 && !/^STEP\d/.test(cur.title)) names.unshift(cur.title);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return [docTitle(doc), ...names].join(" › ");
}

/**
 * 全カテゴリーの本文から探す（大文字・小文字は区別しない）。
 * 1つの区切りで何度も出るときは、それぞれを1件にする（上限 limit 件）。
 */
export function searchDocs(
  docs: readonly NeedsGuideDoc[],
  query: string,
  opts: { docId?: string; limit?: number } = {}
): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const limit = opts.limit ?? 200;
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    if (opts.docId && doc.id !== opts.docId) continue;
    const sections = splitSections(doc);
    for (const s of sections) {
      const text = plainOf(s.level > 0 ? `${s.title}\n${s.body}` : s.body);
      const lower = text.toLowerCase();
      let from = 0;
      for (;;) {
        const at = lower.indexOf(qLower, from);
        if (at < 0) break;
        const start = Math.max(0, at - SNIPPET);
        const end = Math.min(text.length, at + q.length + SNIPPET);
        hits.push({
          docId: doc.id,
          sectionId: s.id,
          path: pathOf(doc, sections, s),
          before: (start > 0 ? "…" : "") + text.slice(start, at),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length, end) + (end < text.length ? "…" : ""),
          tab: s.tab,
        });
        if (hits.length >= limit) return hits;
        from = at + q.length;
      }
    }
  }
  return hits;
}
