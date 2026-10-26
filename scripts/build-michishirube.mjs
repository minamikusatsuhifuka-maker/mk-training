// 成長の道しるべ（docs/michishirube/*.md・別紙A〜G）→ src/lib/michishirube-seed.ts を作る（指示書270）
//
// 【なぜスクリプトで作るのか】文言の正本は同梱の .md で、言い換え・要約・追記をしない決まり（成功の原則と同じ仕組み）。
//   手で書き写すと1字ずれても気づけないので、.md の表の升・行をそのまま取り出す。
// 【院長が直す】の印は文から外して fix:true にする（スタッフの画面には出さない）。
// 【給与・手当】別紙Aの4章（段の手当）・5章（戻りの給与）・9章（始める段取り）は**取り出さない**。
//   別紙Aから使うのは 2-2 の「3つの柱」の表と、G2 の確かめ方だけ。
//
// 実行: node scripts/build-michishirube.mjs        … 作り直す
//       node scripts/build-michishirube.mjs --check … 今のファイルと食い違いがあれば失敗（作り直さない）

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DOCS = join(ROOT, "docs/michishirube");
const OUT = join(ROOT, "src/lib/michishirube-seed.ts");
const MARK = "【院長が直す】";

const file = readdirSync(DOCS).find((f) => f.endsWith(".md"));
if (!file) throw new Error("docs/michishirube に .md がありません");
const all = readFileSync(join(DOCS, file), "utf8").split("\n").map((l) => l.replace(/\r$/, ""));

// ─── 別紙ごとに分ける ───
const parts = {};
{
  let cur = null;
  for (const l of all) {
    const m = /^# 別紙([A-G])/.exec(l);
    if (m) {
      cur = m[1];
      parts[cur] = [];
      continue;
    }
    if (cur) parts[cur].push(l);
  }
}
for (const k of "ABCDEFG") if (!parts[k]) throw new Error(`別紙${k}が見つかりません`);

const fail = (msg) => {
  throw new Error(msg);
};

/** 見出し（行そのものの前方一致）から、次の同じ深さ以上の見出しの手前まで */
function section(lines, heading) {
  const i = lines.findIndex((l) => l.startsWith(heading));
  if (i < 0) fail(`見出しがありません: ${heading}`);
  const depth = /^(#+)/.exec(lines[i])[1].length;
  let j = i + 1;
  for (; j < lines.length; j++) {
    const m = /^(#+) /.exec(lines[j]);
    if (m && m[1].length <= depth) break;
  }
  return lines.slice(i + 1, j);
}

const trim = (arr) => {
  const a = [...arr];
  while (a.length && (a[a.length - 1].trim() === "" || a[a.length - 1].trim() === "---")) a.pop();
  while (a.length && a[0].trim() === "") a.shift();
  return a;
};

/** 表（ヘッダー行の位置から）。区切り行は外す */
function tableAt(lines, start) {
  const rows = [];
  for (let k = start; k < lines.length && lines[k].startsWith("|"); k++) {
    const cells = lines[k].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return { head: rows[0], rows: rows.slice(1) };
}

/** その範囲の n 番目（0始まり）の表 */
function nthTable(lines, n = 0) {
  let count = 0;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].startsWith("|") && (k === 0 || !lines[k - 1].startsWith("|"))) {
      if (count === n) return tableAt(lines, k);
      count++;
    }
  }
  fail(`表が見つかりません（${n}番目）`);
}

/** 太字の行（**…**）のすぐ下の表 */
function tableAfter(lines, boldPrefix) {
  const i = lines.findIndex((l) => l.startsWith(boldPrefix));
  if (i < 0) fail(`見出しがありません: ${boldPrefix}`);
  for (let k = i + 1; k < lines.length; k++) if (lines[k].startsWith("|")) return { title: lines[i].replace(/\*\*/g, ""), ...tableAt(lines, k) };
  fail(`表がありません: ${boldPrefix}`);
}

/** 【院長が直す】の印を外す */
function unmark(s) {
  if (!s.includes(MARK)) return { text: s, fix: false };
  return { text: s.replace(MARK, "").trim(), fix: true };
}

/** 「**ラベル**：本文」の本文 */
function labeled(lines, label) {
  const l = lines.find((x) => x.startsWith(`**${label}**：`));
  if (!l) fail(`「${label}」の行がありません`);
  return l.slice(`**${label}**：`.length);
}

const closingOf = (lines) => lines.filter((l) => l.startsWith("→ "));

// ─── 別紙B：全体版 ───
const B = parts.B;
const aimsMd = trim(section(B, "### 1. この道しるべのねらい")).join("\n");
const b2 = section(B, "### 2. 全体の地図");
const ladder = nthTable(b2, 0);
if (ladder.rows.length !== 8) fail(`全体の地図の段が8つではありません: ${ladder.rows.length}`);
const pillarsStart = b2.findIndex((l) => l.startsWith("**どの段でもつらぬく"));
const pillarsMd = trim(b2.slice(pillarsStart)).join("\n");
const usageMd = trim(section(B, "### 3. 道しるべの使い方"))
  .map((l) => l.replace(/^#### /, "### "))
  .join("\n");
const supportersMd = trim(section(B, "### 5. 支える人の流れ")).join("\n");

// ─── 別紙A：2-2 の3つの柱（給与の章は読まない） ───
const A = parts.A;
const a22 = section(A, "### 2-2.");
const pillarDefs = a22.filter((l) => /^- \*\*柱[123]/.test(l));
if (pillarDefs.length !== 3) fail("3つの柱の説明が3行ではありません");
const pillarTable = nthTable(a22, 0);
const pillarOf = (lv) => {
  const r = pillarTable.rows.find((x) => x[0].replace(/\*\*/g, "") === lv);
  if (!r) fail(`3つの柱の表に ${lv} がありません`);
  return { commit: r[1], philosophy: r[2], desire: r[3] };
};
// G2 の確かめ方（2つの太字の見出しと、その下の箇条）
const g2Note = (() => {
  const i = a22.findIndex((l) => l.startsWith("**「理念を完全に理解している」の確かめ方"));
  if (i < 0) fail("G2 の確かめ方がありません");
  return trim(a22.slice(i)).join("\n");
})();

// ─── 別紙C：学びの地図 ───
const C = parts.C;
const learnSetMd = trim(section(C, "### 1. 学びの3点セット")).join("\n");
const learnOrderMd = trim(section(C, "### 3. 学びの順番の考え方")).join("\n");
const c2 = section(C, "### 2. 全8段の学びの地図");
const learnMap = [];
for (let k = 0; k < c2.length; k++) {
  const m = /^#### (G[1-5]\+?)(（[^）]*）)?(★)?　テーマ：(.+)$/.exec(c2[k]);
  if (!m) continue;
  const level = m[1];
  const t = tableAt(c2, k + 1 + c2.slice(k + 1).findIndex((l) => l.startsWith("|")));
  const hasWhen = t.head.length >= 3;
  learnMap.push({
    level,
    title: `${m[1]}${m[2] ?? ""}${m[3] ?? ""}`,
    theme: m[4],
    whenLabel: hasWhen ? t.head[2] : "",
    rows: t.rows.map((r, i) => {
      const it = unmark(r[1]);
      return {
        id: `m${String(i + 1).padStart(2, "0")}`,
        kind: r[0],
        item: it.text,
        when: hasWhen ? r[2] : "",
        ...(it.fix ? { fix: true } : {}),
      };
    }),
  });
}
if (learnMap.length !== 8) fail(`学びの地図の段が8つではありません: ${learnMap.length}`);

// ─── ステップの表・学びのステップの表 ───
function stepsFrom(t, section) {
  const hasWhen = t.head.length >= 7;
  return t.rows.map((r) => {
    const marks = r.map(unmark);
    const fix = marks.some((x) => x.fix);
    const c = marks.map((x) => x.text);
    return {
      id: c[0],
      category: c[1],
      todo: c[2],
      sign: c[3],
      evidence: c[4],
      when: hasWhen ? c[5] : "",
      supporter: hasWhen ? c[6] : c[5],
      ...(fix ? { fix: true } : {}),
      ...(section ? { section } : {}),
    };
  });
}
function learnsFrom(t, section) {
  const hasWhen = t.head.length >= 6;
  return t.rows.map((r) => {
    const marks = r.map(unmark);
    const fix = marks.some((x) => x.fix);
    const c = marks.map((x) => x.text);
    return {
      id: c[0],
      category: c[1],
      learn: c[2],
      practice: c[3],
      share: c[4],
      when: hasWhen ? c[5] : "",
      ...(fix ? { fix: true } : {}),
      ...(section ? { section } : {}),
    };
  });
}

/** 1つの段（D〜Fの「### n. ステップマップ　Gx」） */
function levelFrom(lines, heading, meaning, goal) {
  const s = section(lines, heading);
  const steps = nthTable(s, 0);
  const lt = tableAfter(s, "**G");
  return {
    meaning,
    goal: goal ?? labeled(s, "ゴール"),
    whenLabel: steps.head[5],
    learnWhenLabel: lt.head[5] ?? "",
    stepsTitle: "",
    learnTitle: lt.title,
    sections: [],
    steps: stepsFrom(steps),
    learnings: learnsFrom(lt),
    closing: closingOf(s),
    extraMd: "",
  };
}

const D = parts.D;
const E = parts.E;
const F = parts.F;
const G = parts.G;

const rangeMeaning = (lines, prefix) => {
  const l = section(lines, "### 0. この範囲の意味").find((x) => x.startsWith(`- **${prefix}**：`));
  if (!l) fail(`この範囲の意味がありません: ${prefix}`);
  return l.slice(2);
};

const d3 = section(D, "### 3. ステップマップ　G1");
const d4 = section(D, "### 4. ステップマップ　G1+");
const byLevel = {
  G1: levelFrom(D, "### 3. ステップマップ　G1", labeled(d3, "この段の意味")),
  "G1+": levelFrom(D, "### 4. ステップマップ　G1+", labeled(d4, "この段の意味")),
  G2: levelFrom(E, "### 2. ステップマップ　G2", rangeMeaning(E, "G2 → G2+")),
  "G2+": levelFrom(E, "### 3. ステップマップ　G2+", rangeMeaning(E, "G2+ → G3")),
  G3: levelFrom(F, "### 2. ステップマップ　G3", rangeMeaning(F, "G3 → G3+")),
  "G3+": levelFrom(F, "### 3. ステップマップ　G3+", rangeMeaning(F, "G3+ → G4")),
};

// G4：前半・後半の2つの区切り（目安の時期は区切りの見出しにある）
{
  const g0 = trim(section(G, "### 0. この範囲の意味")).map((l) => l.replace(/^- /, ""));
  const g1 = section(G, "### 1. G4 前半");
  const g2 = section(G, "### 2. G4 後半");
  const h1 = G.find((l) => l.startsWith("### 1. G4 前半")).replace(/^### 1\. /, "");
  const h2 = G.find((l) => l.startsWith("### 2. G4 後半")).replace(/^### 2\. /, "");
  const l1 = tableAfter(g1, "**G4 前半");
  const l2 = tableAfter(g2, "**G4 後半");
  byLevel.G4 = {
    meaning: g0.join("\n"),
    goal: "",
    whenLabel: "",
    learnWhenLabel: "",
    stepsTitle: "",
    learnTitle: "",
    sections: [
      { key: "a", title: h1, learnTitle: l1.title },
      { key: "b", title: h2, learnTitle: l2.title },
    ],
    steps: [...stepsFrom(nthTable(g1, 0), "a"), ...stepsFrom(nthTable(g2, 0), "b")],
    learnings: [...learnsFrom(l1, "a"), ...learnsFrom(l2, "b")],
    closing: closingOf(g2),
    extraMd: "",
  };
  const g3 = trim(section(G, "### 3. G5 を生きる"));
  byLevel.G5 = {
    meaning: g3[0],
    goal: "",
    whenLabel: "",
    learnWhenLabel: "",
    stepsTitle: "",
    learnTitle: "",
    sections: [],
    steps: [],
    learnings: [],
    closing: [],
    extraMd: trim(g3.slice(1)).join("\n"),
  };
}

const levels = ladder.rows.map((r, i) => {
  const name = r[1];
  const id = /^(G[1-5]\+?)/.exec(name)[1];
  const lv = byLevel[id];
  if (!lv) fail(`段 ${id} の中身がありません`);
  return {
    id,
    no: Number(r[0]),
    name,
    oneLine: r[2],
    guide: r[3],
    pillars: pillarOf(id),
    pillarsNote: id === "G2" ? g2Note : "",
    ...lv,
  };
});
if (levels.map((l) => l.id).join(",") !== "G1,G1+,G2,G2+,G3,G3+,G4,G5") fail("段の並びが違います");

// ─── 技能の4段階 ───
const d1 = section(D, "#### 1-2. 技能の4段階");
const skillStagesMd = trim(d1).join("\n");
const d2 = section(D, "### 2. 技能の4段階チェック表");
const skillNoteRaw = trim(d2).find((l) => l && !l.startsWith("#") && !l.startsWith("|")) ?? "";
// 「…直してください。」は院長に向けた文（管理画面だけ）。スタッフには残りの文だけを出す
const noteSentences = skillNoteRaw.split(/(?<=。)/);
const skillFixNote = noteSentences.filter((x) => x.includes("直してください")).join("");
const skillNote = noteSentences.filter((x) => !x.includes("直してください")).join("");
function lineFrom(heading, id, label) {
  const t = nthTable(section(D, heading), 0);
  const columns = t.head.slice(1).map((h) => ({ level: h.replace(/へ$/, ""), label: h }));
  return {
    id,
    label,
    columns,
    items: t.rows.map((r, i) => {
      const n = unmark(r[0]);
      const reach = {};
      columns.forEach((c, j) => (reach[c.level] = r[j + 1]));
      return { id: `${id[0]}${String(i + 1).padStart(2, "0")}`, name: n.text, reach, ...(n.fix ? { fix: true } : {}) };
    }),
  };
}
const skillLines = [
  lineFrom("#### 2-1. 看護師ライン", "nurse", "看護師ライン"),
  lineFrom("#### 2-2. マルチタスク医療事務ライン", "clerk", "マルチタスク医療事務ライン"),
];
function rangeFrom(lines, id, title) {
  const s = section(lines, "### 1. 技能の4段階");
  const t = nthTable(s, 0);
  const columns = t.head.slice(1).map((h) => ({ level: h.replace(/へ$/, ""), label: h }));
  const body = trim(s);
  return {
    id,
    title,
    intro: body.find((l) => l && !l.startsWith("|")) ?? "",
    headLabel: t.head[0],
    columns,
    items: t.rows.map((r, i) => {
      const n = unmark(r[0]);
      const reach = {};
      columns.forEach((c, j) => (reach[c.level] = r[j + 1]));
      return { id: `${id}-${String(i + 1).padStart(2, "0")}`, name: n.text, reach, ...(n.fix ? { fix: true } : {}) };
    }),
    note: body.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)).join("\n"),
  };
}
const skillRanges = [rangeFrom(E, "r23", "G2 → G2+ → G3"), rangeFrom(F, "r34", "G3 → G3+ → G4")];

const content = {
  version: 1,
  aimsMd,
  pillarsMd: [pillarsMd, "", ...pillarDefs].join("\n"),
  usageMd,
  skillStagesMd,
  skillNote,
  skillFixNote,
  skillLines,
  skillRanges,
  learnSetMd,
  learnMap,
  learnOrderMd,
  supportersMd,
  levels,
  updatedAt: "",
  updatedBy: "",
  updatedByName: "",
  history: [],
};

// 給与・手当の言葉が紛れ込んでいないか（紛れたら失敗）
const json = JSON.stringify(content);
for (const w of ["手当", "給与", "号俸", "基本給", "賃金"]) if (json.includes(w)) fail(`給与・手当の言葉が入っています: ${w}`);
if (/[0-9０-９,，]+円/.test(json)) fail("金額（○円）が入っています");
if (json.includes(MARK)) fail("【院長が直す】の印が文に残っています");

const out = `// このファイルは scripts/build-michishirube.mjs が docs/michishirube/${file} から作る（手で直さない）
// 指示書270：成長の道しるべ（はじめの中身）。院長が管理画面で直した中身は clinic_staff_growth の michi_content に入る。

import type { MichiContent } from "./michishirube";

export const MICHI_SEED: MichiContent = ${JSON.stringify(content, null, 2)};
`;

if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(OUT, "utf8");
  } catch {
    /* 無い */
  }
  if (cur !== out) {
    console.error("michishirube-seed.ts が docs/michishirube と食い違っています。node scripts/build-michishirube.mjs で作り直してください");
    process.exit(1);
  }
  console.log("michishirube-seed.ts ✓");
} else {
  writeFileSync(OUT, out);
  const n = levels.reduce((a, l) => a + l.steps.length + l.learnings.length, 0);
  console.log(`作りました: 段 ${levels.length}・ステップ＋学び ${n}・業務 ${skillLines.reduce((a, l) => a + l.items.length, 0)}`);
}
