// 欲求別成長支援ガイド（docs/needs-guide/*.md）→ src/lib/needs-guide-data.ts を作る
//
// 【なぜスクリプトで作るのか】ガイドの文言は同梱の .md が正本で、言い換え・要約・追記をしない決まり。
//   手で書き写すと1字ずれても気づけないので、.md から機械的に取り出す。
//   取り出した文は .md の行そのもの（先頭の「- 」だけを外す）。太字の ** もそのまま残す（表示側で太字にする）。
// 【取りこぼしの検査】項目の範囲にある空でない行は、見出し・区切り以外すべてどこかに入っていなければ失敗する。
//
// 実行: node scripts/build-needs-guide.mjs        … 作り直す
//       node scripts/build-needs-guide.mjs --check … 今のファイルと食い違いがあれば失敗（作り直さない）

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DOCS = join(ROOT, "docs/needs-guide");
const OUT = join(ROOT, "src/lib/needs-guide-data.ts");

/** 項目名 → 指示書のキー（15）と、診断結果の保存キー（needs-survey.ts の NEED_DETAIL_ITEMS） */
const ITEMS = [
  ["安全・安定", "anzen_antei", "safety"],
  ["健康", "kenko", "health"],
  ["愛", "ai", "love"],
  ["所属", "shozoku", "belong"],
  ["達成", "tassei", "achievement"],
  ["承認", "shonin", "approval"],
  ["貢献", "koken", "contribution"],
  ["競争", "kyoso", "competition"],
  ["解放", "kaiho", "release"],
  ["変化", "henka", "change"],
  ["自分らしさ", "jibunrashisa", "individuality"],
  ["ユーモア", "humor", "humor"],
  ["好奇心", "kokishin", "curiosity"],
  ["学習・成長", "gakushu_seicho", "learning"],
  ["創造性", "sozosei", "creativity"],
];
const CATEGORY_FILES = [
  ["survival", "STEP2-1_生存の欲求", "生存の欲求"],
  ["belonging", "STEP2-2_愛・所属の欲求", "愛・所属の欲求"],
  ["power", "STEP2-3_力の欲求", "力の欲求"],
  ["freedom", "STEP2-4_自由の欲求", "自由の欲求"],
  ["fun", "STEP2-5_楽しみの欲求", "楽しみの欲求"],
];
const SECTION_KEYS = { 表れ: "signs", 成長支援: "growth", 能力開発: "development", 声かけ例: "phrases", 避けたい関わり: "avoid", 注意: "note" };

const files = readdirSync(DOCS);
const fileOf = (part) => {
  const f = files.find((x) => x.includes(part));
  if (!f) throw new Error(`docs/needs-guide に ${part} がありません`);
  return join(DOCS, f);
};
const bullet = (line) => (line.startsWith("- ") ? line.slice(2) : line);

const items = [];
const hints = [];
for (const [category, part, categoryName] of CATEGORY_FILES) {
  const lines = readFileSync(fileOf(part), "utf8").split("\n").map((l) => l.replace(/\r$/, ""));
  let cur = null; // 今の項目
  let side = null; // "high" | "low"
  let section = null;
  let inHints = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const m = /^## 項目\d+　(.+)$/.exec(line);
    if (m) {
      const def = ITEMS.find((x) => x[0] === m[1]);
      if (!def) throw new Error(`知らない項目: ${m[1]}`);
      cur = { key: def[1], surveyKey: def[2], name: def[0], category, meaning: [], high: {}, low: {} };
      items.push(cur);
      side = null;
      section = null;
      inHints = false;
      continue;
    }
    if (/^## 読み方のヒント（/.test(line)) {
      if (line !== `## 読み方のヒント（${categoryName}）`) throw new Error(`見出しが想定と違います: ${line}`);
      cur = null;
      inHints = true;
      hints.push({ category, title: line.slice(3), items: [] });
      continue;
    }
    if (/^## /.test(line) || /^# /.test(line)) {
      cur = null;
      inHints = false;
      continue;
    }
    if (t === "" || t === "---") continue;
    if (inHints) {
      if (!line.startsWith("- ")) throw new Error(`読み方のヒントに箇条書きでない行: ${line}`);
      hints[hints.length - 1].items.push(bullet(line));
      continue;
    }
    if (!cur) continue; // 前書き（型・前提）は項目ではない
    if (line === "### 欲求が強い人") { side = "high"; section = null; continue; }
    if (line === "### 欲求が低い人") { side = "low"; section = null; continue; }
    const s = /^\*\*(.+)\*\*$/.exec(t);
    if (s && side) {
      const key = SECTION_KEYS[s[1]];
      if (!key) throw new Error(`知らない小見出し: ${s[1]}（${cur.name}）`);
      section = key;
      cur[side][key] = [];
      continue;
    }
    if (!side) {
      // 意味（「意味：」「意味（当院の定義）：」とその下の箇条書き）。行そのまま
      cur.meaning.push(line);
      continue;
    }
    if (!section) throw new Error(`小見出しの前に本文があります: ${line}（${cur.name}）`);
    cur[side][section].push(bullet(line));
  }
}

// 4章「最初の一言」（STEP3-1）
const step31 = readFileSync(fileOf("STEP3-1_1on1での使い方"), "utf8").split("\n");
const start = step31.findIndex((l) => l.startsWith("## 4. "));
const end = step31.findIndex((l, i) => i > start && l.startsWith("## "));
for (const l of step31.slice(start, end)) {
  const m = /^\| (.+?) \| (「.+」) \|$/.exec(l.trim());
  if (!m) continue;
  const it = items.find((x) => x.name === m[1]);
  if (!it) throw new Error(`最初の一言の項目が見つかりません: ${m[1]}`);
  it.firstQuestion = m[2];
}

// 検査: 15項目そろっている・強い/低いの5つの欄・最初の一言
if (items.length !== 15) throw new Error(`項目が15ではありません: ${items.length}`);
for (const it of items) {
  for (const side of ["high", "low"]) {
    for (const k of ["signs", "growth", "development", "phrases", "avoid"]) {
      if (!it[side][k] || it[side][k].length === 0) throw new Error(`${it.name} の ${side}.${k} が空です`);
    }
  }
  if (!it.firstQuestion) throw new Error(`${it.name} の最初の一言がありません`);
  if (it.meaning.length === 0) throw new Error(`${it.name} の意味がありません`);
}
if (hints.length !== 5) throw new Error(`読み方のヒントが5つではありません: ${hints.length}`);

const order = ITEMS.map((x) => x[1]);
items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

const side = (s) => {
  const o = { signs: s.signs, growth: s.growth, development: s.development, phrases: s.phrases, avoid: s.avoid };
  if (s.note) o.note = s.note;
  return o;
};
const data = items.map((it) => ({
  key: it.key,
  surveyKey: it.surveyKey,
  name: it.name,
  category: it.category,
  meaning: it.meaning.join("\n"),
  high: side(it.high),
  low: side(it.low),
  firstQuestion: it.firstQuestion,
}));

const src = `// このファイルは scripts/build-needs-guide.mjs が docs/needs-guide/*.md から作ります。**手で直さないこと。**
// 文言の正本は docs/needs-guide/ の .md（言い換え・要約・追記をしない）。.md を直したら
// \`node scripts/build-needs-guide.mjs\` を実行して作り直してください。

import type { NeedsGuideItem, NeedsGuideHint } from "./needs-guide";

export const NEEDS_GUIDE_ITEMS: readonly NeedsGuideItem[] = ${JSON.stringify(data, null, 2)};

export const NEEDS_GUIDE_HINTS: readonly NeedsGuideHint[] = ${JSON.stringify(hints, null, 2)};
`;

// ─── ガイド・人材育成研修の全文（管理画面「📘 欲求別成長支援ガイド」「🎓 人材育成研修」で表示） ───
// .md の中身を**そのまま**入れる（1文字も変えない）。サーバー専用（API が見られる人にだけ返す）。
const DOCS_OUT = join(ROOT, "src/lib/needs-guide-docs-server.ts");
const DOC_FILES = [
  ["step1", "STEP1_", "土台", "guide"],
  ["survival", "STEP2-1_", "生存の欲求", "guide"],
  ["belonging", "STEP2-2_", "愛・所属の欲求", "guide"],
  ["power", "STEP2-3_", "力の欲求", "guide"],
  ["freedom", "STEP2-4_", "自由の欲求", "guide"],
  ["fun", "STEP2-5_", "楽しみの欲求", "guide"],
  ["oneonone", "STEP3-1_", "1on1での使い方", "guide"],
  ["training", "STEP3-2_", "人材育成研修", "training"],
];
const docs = DOC_FILES.map(([id, part, label, kind]) => {
  const matched = files.filter((x) => x.includes(part));
  if (matched.length !== 1) throw new Error(`docs/needs-guide に ${part} がちょうど1つありません（${matched.length}件）`);
  return { id, label, kind, file: matched[0], markdown: readFileSync(join(DOCS, matched[0]), "utf8") };
});
const docsSrc = `// このファイルは scripts/build-needs-guide.mjs が docs/needs-guide/*.md から作ります。**手で直さないこと。**
// .md の中身をそのまま入れています（言い換え・要約・追記をしない）。
// **サーバー専用**：クライアントから import しないこと（見られる人の判定は /api/admin/people-training/*）。

import type { NeedsGuideDoc } from "./needs-guide-docs";

export const NEEDS_GUIDE_DOCS: readonly NeedsGuideDoc[] = ${JSON.stringify(docs, null, 2)};
`;

if (process.argv.includes("--check")) {
  if (readFileSync(DOCS_OUT, "utf8") !== docsSrc) {
    console.error("[needs-guide] src/lib/needs-guide-docs-server.ts が docs/needs-guide/*.md と食い違っています。node scripts/build-needs-guide.mjs で作り直してください");
    process.exit(1);
  }
  const now = readFileSync(OUT, "utf8");
  if (now !== src) {
    console.error("[needs-guide] src/lib/needs-guide-data.ts が docs/needs-guide/*.md と食い違っています。node scripts/build-needs-guide.mjs で作り直してください");
    process.exit(1);
  }
  console.log("[needs-guide] データは .md と一致しています（15項目・読み方のヒント5・全文8ファイル）");
} else {
  writeFileSync(OUT, src);
  writeFileSync(DOCS_OUT, docsSrc);
  console.log(`[needs-guide] ${OUT} と ${DOCS_OUT} を作りました（15項目・読み方のヒント5・全文8ファイル）`);
}
