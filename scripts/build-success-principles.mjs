// 成功の原則×行動例（docs/success-principles/*.md）→ src/lib/success-principles-data-server.ts を作る
//
// 【なぜスクリプトで作るのか】文言の正本は同梱の .md で、言い換え・要約・追記をしない決まり（欲求ガイドと同じ仕組み）。
//   手で書き写すと1字ずれても気づけないので、.md から機械的に取り出す。取り出す文は .md の行そのもの
//   （先頭の「- 」と、行の種類を表す「意味：」「考え方：」などの頭だけを外す）。
// 【スタッフ向け】各項目の「問い：」「1on1の問い：」の行と「※」の行は**データに入れない**（スタッフにはそもそも渡らない）。
//   管理画面（📘 欲求別成長支援ガイド）には、.md 2つの中身をそのまま渡す（問い・※の行も含めてすべて）。
// 【取りこぼしの検査】項目の範囲にある空でない行は、すべてどれかの種類に入っていなければ失敗する。
//
// 実行: node scripts/build-success-principles.mjs        … 作り直す
//       node scripts/build-success-principles.mjs --check … 今のファイルと食い違いがあれば失敗（作り直さない）

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DOCS = join(ROOT, "docs/success-principles");
const OUT = join(ROOT, "src/lib/success-principles-data-server.ts");

const files = readdirSync(DOCS);
const fileOf = (part) => {
  const f = files.find((x) => x.includes(part) && x.endsWith(".md"));
  if (!f) throw new Error(`docs/success-principles に ${part} がありません`);
  return f;
};
const ACTIONS_FILE = fileOf("成功の原則_行動例_");
const ONE_ON_ONE_FILE = fileOf("成功の原則_1on1での使い方_");
const actionsMd = readFileSync(join(DOCS, ACTIONS_FILE), "utf8");
const oneOnOneMd = readFileSync(join(DOCS, ONE_ON_ONE_FILE), "utf8");

const lines = actionsMd.split("\n").map((l) => l.replace(/\r$/, ""));

// ─── 冒頭の注記（「行動例と考え方の例は『選ぶもの』…評価には使いません。」） ───
const firstSection = lines.findIndex((l) => l.startsWith("## "));
const noteLine = lines.slice(0, firstSection).find((l) => l.startsWith("- ") && l.includes("選ぶもの"));
if (!noteLine) throw new Error("冒頭の注記（選ぶもの）が見つかりません");
const note = noteLine.slice(2);

// ─── 「## 」で区切る ───
const sections = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) sections.push({ title: lines[i].slice(3), start: i + 1, end: lines.length });
}
for (let k = 0; k < sections.length - 1; k++) sections[k].end = sections[k + 1].start - 1;
if (sections.length !== 4) throw new Error(`「## 」の章が4つではありません: ${sections.length}`);

const trimSeparators = (arr) => {
  const a = [...arr];
  while (a.length && (a[a.length - 1].trim() === "" || a[a.length - 1].trim() === "---")) a.pop();
  while (a.length && a[0].trim() === "") a.shift();
  return a;
};

// 0. 土台（本文と表をそのまま）
const s0 = sections[0];
if (!/^0\. /.test(s0.title)) throw new Error(`最初の章が 0. ではありません: ${s0.title}`);
const foundation = { id: "c0", title: s0.title, markdown: trimSeparators(lines.slice(s0.start, s0.end)).join("\n") };

// 1〜3. 項目ごと
const KINDS = [
  [/^意味：/, "meaning", 3],
  [/^- 考え方：/, "thought", 6],
  [/^- サイン：/, "sign", 6],
  [/^- 乗り越える行動：/, "overcome", 9],
  [/^- 1on1の問い：/, "question", -1],
  [/^- 問い：/, "question", -1],
  [/^- ※/, "note", -1],
];
const categories = [];
let hiddenCount = 0;
for (let k = 1; k < sections.length; k++) {
  const sec = sections[k];
  if (!new RegExp(`^${k}\\. `).test(sec.title)) throw new Error(`章の番号が合いません: ${sec.title}`);
  const cat = { id: `c${k}`, title: sec.title, items: [] };
  let cur = null;
  for (let i = sec.start; i < sec.end; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t === "" || t === "---") continue;
    if (line.startsWith("### ")) {
      cur = { id: `c${k}-${cat.items.length + 1}`, title: line.slice(4), lines: [] };
      cat.items.push(cur);
      continue;
    }
    if (!cur) {
      // 章の前書き（10の障害の「※『障害』は…」）。スタッフには出さない
      if (!line.startsWith("※")) throw new Error(`項目の前に知らない行があります: ${line}`);
      hiddenCount++;
      continue;
    }
    const kind = KINDS.find(([re]) => re.test(line));
    if (kind) {
      if (kind[2] < 0) {
        hiddenCount++;
        continue; // 問い・※ はスタッフに渡さない
      }
      const text = line.slice(kind[2]);
      if (kind[1] === "thought") {
        const at = text.indexOf("→");
        if (at < 0) throw new Error(`考え方に「→」がありません: ${line}`);
        cur.lines.push({ kind: "thought", text, before: text.slice(0, at), after: text.slice(at + 1) });
      } else {
        cur.lines.push({ kind: kind[1], text });
      }
      continue;
    }
    if (line.startsWith("- ")) {
      cur.lines.push({ kind: "action", text: line.slice(2) });
      continue;
    }
    throw new Error(`知らない形の行があります: ${line}`);
  }
  categories.push(cat);
}
const counts = categories.map((c) => c.items.length);
if (counts.join(",") !== "8,10,10") throw new Error(`項目の数が 8・10・10 ではありません: ${counts.join(",")}`);

// 取りこぼしの検査：本文に入れた文は、すべて .md の中にそのまま在る
for (const c of categories)
  for (const it of c.items)
    for (const l of it.lines) if (!actionsMd.includes(l.text)) throw new Error(`.md に無い文になっています: ${l.text}`);

const staff = { note, foundation, categories };
const guideDoc = {
  id: "success",
  label: "成功の原則（行動例と1on1の問い）",
  kind: "guide",
  file: `${ONE_ON_ONE_FILE} ／ ${ACTIONS_FILE}`,
  // 順番：1on1での使い方 → 行動例（2つの .md をそのまま続ける）
  markdown: `${oneOnOneMd}\n${actionsMd}`,
};

const src = `// このファイルは scripts/build-success-principles.mjs が docs/success-principles/*.md から作ります。**手で直さないこと。**
// 文言の正本は docs/success-principles/ の .md（言い換え・要約・追記をしない）。.md を直したら
// \`node scripts/build-success-principles.mjs\` を実行して作り直してください（ビルドで食い違いを検査します）。
// **サーバー専用**：クライアントから import しないこと（ログイン中のスタッフだけに API が返す）。
//   SUCCESS_STAFF には「問い：」「1on1の問い：」「※」の行を入れていない（スタッフには渡さない）。
//   SUCCESS_GUIDE_DOC は管理画面の欲求別成長支援ガイド用（.md 2つをそのまま・問いと※の行も含む）。

import type { SuccessStaffData } from "./success-principles";
import type { NeedsGuideDoc } from "./needs-guide-docs";

export const SUCCESS_STAFF: SuccessStaffData = ${JSON.stringify(staff, null, 2)};

export const SUCCESS_GUIDE_DOC: NeedsGuideDoc = ${JSON.stringify(guideDoc, null, 2)};
`;

if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(OUT, "utf8");
  } catch {
    /* 無い */
  }
  if (cur !== src) {
    console.error("[success-principles] src/lib/success-principles-data-server.ts が docs/success-principles/*.md と食い違っています。node scripts/build-success-principles.mjs で作り直してください");
    process.exit(1);
  }
  console.log("[success-principles] 正本と一致しています");
} else {
  writeFileSync(OUT, src);
  console.log(`[success-principles] ${OUT} を作りました（章0・項目 ${counts.join("・")}・スタッフに渡さない行 ${hiddenCount}）`);
}
