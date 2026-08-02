// 人事制度ポータルのポータル内検索（指示書116）
// - クライアントサイドの部分一致。対象: 4制度ページの全テキスト＋FAQ（質問・回答）。
// - 正規化: NFKC（全角半角統一）＋小文字化 → 大文字小文字・全角半角を同一視。
// - 結果は「ページ名／セクション名＋前後の抜粋」。href のハッシュで該当箇所へ遷移する。
// - データは静的（src/data/hr-portal.ts）のため、索引はモジュール読込時に1回だけ構築。

import {
  HR_GRADE_SECTIONS,
  HR_EVALUATION_SECTIONS,
  HR_SALARY_SECTIONS,
  HR_TRANSITIONS,
  HR_PROMOTION_INTRO,
  HR_PROMOTION_NOTES,
  HR_PROMOTION_NOTES_TITLE,
  HR_FAQ,
  type HrSection,
  type HrBlock,
} from "@/data/hr-portal";

export type HrSearchHit = {
  pageTitle: string;
  section: string;
  href: string;
  excerpt: string;
};

type Entry = {
  pageTitle: string;
  section: string;
  href: string;
  text: string; // 表示用原文（**は除去）
  norm: string; // 正規化済み
};

function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

function stripBold(s: string): string {
  return s.replace(/\*\*/g, "");
}

function blockText(b: HrBlock): string {
  if (b.type === "p") return b.text;
  if (b.type === "list") return b.items.join("／");
  return [b.headers.join(" "), ...b.rows.map((r) => r.join(" "))].join("　");
}

function makeEntry(
  pageTitle: string,
  section: string,
  href: string,
  rawText: string
): Entry {
  const text = stripBold(rawText);
  return { pageTitle, section, href, text, norm: normalizeForSearch(text) };
}

function sectionEntries(
  pageTitle: string,
  basePath: string,
  sections: HrSection[]
): Entry[] {
  return sections.map((s) =>
    makeEntry(
      pageTitle,
      stripBold(s.title),
      `${basePath}#${s.id}`,
      `${s.title}　${s.blocks.map(blockText).join("　")}`
    )
  );
}

function buildIndex(): Entry[] {
  const entries: Entry[] = [];

  entries.push(...sectionEntries("等級制度", "/hr/grade", HR_GRADE_SECTIONS));
  entries.push(
    ...sectionEntries("評価制度", "/hr/evaluation", HR_EVALUATION_SECTIONS)
  );
  entries.push(
    ...sectionEntries("給与テーブル", "/hr/salary", HR_SALARY_SECTIONS)
  );

  // ステージ移行: 冒頭注記＋各移行のパートごと＋運用メモ
  entries.push(
    makeEntry(
      "ステージ移行",
      "冒頭注記・凡例",
      "/hr/promotion",
      HR_PROMOTION_INTRO.join("　")
    )
  );
  for (const t of HR_TRANSITIONS) {
    const href = `/hr/promotion#${t.id}`;
    const parts: { label: string; text: string }[] = [
      { label: t.meaningTitle, text: t.meaning.join("　") },
      { label: t.learningTitle, text: t.learning.join("／") },
      { label: t.axesTitle, text: t.axes.join("　") },
      ...t.attainment.map((g) => ({
        label: `${t.attainmentTitle}　${g.heading}`,
        text: g.items.join("　"),
      })),
      { label: t.sharingTitle, text: t.sharing },
      { label: t.perspectiveTitle, text: t.perspective },
      { label: t.questionsTitle, text: t.questions.join("　") },
    ];
    for (const p of parts) {
      entries.push(
        makeEntry("ステージ移行", `${t.title}｜${p.label}`, href, p.text)
      );
    }
  }
  entries.push(
    makeEntry(
      "ステージ移行",
      HR_PROMOTION_NOTES_TITLE,
      "/hr/promotion#notes",
      HR_PROMOTION_NOTES.join("　")
    )
  );

  // FAQ: 質問・回答の両方を対象にする
  for (const f of HR_FAQ) {
    entries.push(
      makeEntry(
        "よくある質問",
        f.q,
        `/hr/faq#q${f.id}`,
        `${f.q}　${f.a}`
      )
    );
  }

  return entries;
}

const INDEX: Entry[] = buildIndex();

const EXCERPT_BEFORE = 20;
const EXCERPT_AFTER = 40;
const MAX_HITS = 50;

export function searchHr(rawQuery: string): HrSearchHit[] {
  const q = normalizeForSearch(rawQuery.trim());
  if (!q) return [];
  const hits: HrSearchHit[] = [];
  for (const e of INDEX) {
    const i = e.norm.indexOf(q);
    if (i === -1) continue;
    // NFKCで文字数が変わらない場合は原文から抜粋（通常ケース）。
    // 変わる場合は位置ずれを避けるため正規化文から抜粋する
    const base = e.norm.length === e.text.length ? e.text : e.norm;
    const start = Math.max(0, i - EXCERPT_BEFORE);
    const end = Math.min(base.length, i + q.length + EXCERPT_AFTER);
    const excerpt =
      (start > 0 ? "…" : "") +
      base.slice(start, end) +
      (end < base.length ? "…" : "");
    hits.push({
      pageTitle: e.pageTitle,
      section: e.section,
      href: e.href,
      excerpt,
    });
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}
