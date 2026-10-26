// 🧭 成長の道しるべ（指示書270）— 型と純関数（依存なし）
//
// 【中身の正本】docs/michishirube/*.md（別紙A〜G）→ scripts/build-michishirube.mjs → michishirube-seed.ts（はじめの中身）。
//   院長（と任された人）が管理画面で直したら、clinic_staff_growth の michi_content（1行）に丸ごと保存し、以後はそちらを使う。
// 【院長が直す】の印は、文から外して fix:true で持つ。スタッフの画面には出さない（管理画面だけ）。
// 給与・手当（別紙Aの4章・5章・9章）は、そもそもデータに入れない。

export const MICHI_LEVEL_IDS = ["G1", "G1+", "G2", "G2+", "G3", "G3+", "G4", "G5"] as const;
export type MichiLevelId = (typeof MICHI_LEVEL_IDS)[number];

export function isMichiLevelId(v: unknown): v is MichiLevelId {
  return typeof v === "string" && (MICHI_LEVEL_IDS as readonly string[]).includes(v);
}

/** ステップ（やること／できた目安／根拠の残し方／目安の時期／支える人） */
export type MichiStep = {
  id: string;
  category: string;
  todo: string;
  sign: string;
  evidence: string;
  when: string;
  supporter: string;
  /** 【院長が直す】の印（管理画面だけに出す） */
  fix?: boolean;
  /** G4 の前半・後半のように、段の中を分けるときの区切り（sections の key） */
  section?: string;
};

/** 学びのステップ（学ぶ → 実践 → 分かち合う） */
export type MichiLearn = {
  id: string;
  category: string;
  learn: string;
  practice: string;
  share: string;
  when: string;
  fix?: boolean;
  section?: string;
};

export type MichiSection = {
  key: string;
  title: string;
  /** その区切りの学びのステップの見出し */
  learnTitle: string;
};

export type MichiLevel = {
  id: MichiLevelId;
  no: number;
  /** 例「G1 ルーキー」「G2+ ★」（全体版の表のまま） */
  name: string;
  oneLine: string;
  guide: string;
  /** 3つの柱（等級の中間段 確定版 2-2 の表のまま） */
  pillars: { commit: string; philosophy: string; desire: string };
  /** 段の3つの柱のあとに出す補足（G2 の確かめ方など） */
  pillarsNote: string;
  meaning: string;
  goal: string;
  /** ステップの表の「目安の時期」の列の名前（例「目安の時期（G1+に入ってから）」） */
  whenLabel: string;
  learnWhenLabel: string;
  stepsTitle: string;
  learnTitle: string;
  sections: MichiSection[];
  steps: MichiStep[];
  learnings: MichiLearn[];
  /** 「→ ここまでで…」 */
  closing: string[];
  /** G5 を生きる（Markdown） */
  extraMd: string;
};

export type MichiSkillItem = {
  id: string;
  name: string;
  /** 段ごとの到達（例 { "G1+": "③", "G2": "③（美容から1つ）" }） */
  reach: Record<string, string>;
  fix?: boolean;
};

export type MichiSkillLine = {
  id: string;
  label: string;
  /** 列（到達の段）と見出し（例 [{level:"G1+", label:"G1+へ"}]） */
  columns: { level: MichiLevelId; label: string }[];
  items: MichiSkillItem[];
};

/** G2 → G3・G3 → G4 の「技能の4段階（この範囲で見る所）」 */
export type MichiSkillRange = {
  id: string;
  title: string;
  intro: string;
  headLabel: string;
  columns: { level: MichiLevelId; label: string }[];
  items: MichiSkillItem[];
  note: string;
};

export type MichiMapRow = { id: string; kind: string; item: string; when: string; fix?: boolean };

export type MichiMapLevel = {
  level: MichiLevelId;
  title: string;
  theme: string;
  whenLabel: string;
  rows: MichiMapRow[];
};

export type MichiHistory = { at: string; by: string; byName: string; what: string };

export type MichiContent = {
  version: 1;
  /** 1. この道しるべのねらい（Markdown） */
  aimsMd: string;
  /** どの段でもつらぬく「3つの柱」（Markdown） */
  pillarsMd: string;
  /** 3. 道しるべの使い方（Markdown） */
  usageMd: string;
  /** 技能の4段階（段階・状態・確かめ方の表と注記・Markdown） */
  skillStagesMd: string;
  skillNote: string;
  /** 院長に向けた注記（管理画面だけ） */
  skillFixNote: string;
  skillLines: MichiSkillLine[];
  skillRanges: MichiSkillRange[];
  /** 学びの3点セット（Markdown） */
  learnSetMd: string;
  learnMap: MichiMapLevel[];
  /** 学びの順番の考え方（Markdown） */
  learnOrderMd: string;
  /** 5. 支える人の流れ（Markdown） */
  supportersMd: string;
  levels: MichiLevel[];
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
  history: MichiHistory[];
};

export const MICHI_HISTORY_MAX = 200;

/** 【院長が直す】の印（データの外す前の文に入っている言葉） */
export const DIRECTOR_FIX_MARK = "【院長が直す】";

// ─── 区分 ───

/** その段の区分（ステップと学びのステップに出てくる順・重複なし） */
export function categoriesOf(level: Pick<MichiLevel, "steps" | "learnings">): string[] {
  const out: string[] = [];
  for (const c of [...level.steps.map((s) => s.category), ...level.learnings.map((l) => l.category)]) {
    const t = c.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function filterByCategory<T extends { category: string }>(rows: T[], category: string): T[] {
  if (!category) return rows;
  return rows.filter((r) => r.category.trim() === category);
}

// ─── スタッフに返すとき（【院長が直す】の印を外す） ───

export function stripFixMarks(c: MichiContent): MichiContent {
  const strip = <T extends { fix?: boolean }>(x: T): T => {
    const { fix: _f, ...rest } = x;
    void _f;
    return rest as T;
  };
  return {
    ...c,
    skillLines: c.skillLines.map((l) => ({ ...l, items: l.items.map(strip) })),
    skillRanges: c.skillRanges.map((r) => ({ ...r, items: r.items.map(strip) })),
    learnMap: c.learnMap.map((m) => ({ ...m, rows: m.rows.map(strip) })),
    levels: c.levels.map((lv) => ({ ...lv, steps: lv.steps.map(strip), learnings: lv.learnings.map(strip) })),
    history: [],
    updatedBy: "",
    skillFixNote: "",
  };
}

// ─── 保存する前に形を整える（壊れた入力で画面が落ちないように） ───

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : "");
const bool = (v: unknown): boolean => v === true;
const ID_RE = /^[A-Za-z0-9+_.-]{1,40}$/;

function normStep(v: unknown, sections: Set<string>): MichiStep | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 40);
  if (!ID_RE.test(id)) return null;
  const section = str(o.section, 20);
  return {
    id,
    category: str(o.category, 40),
    todo: str(o.todo),
    sign: str(o.sign),
    evidence: str(o.evidence),
    when: str(o.when, 200),
    supporter: str(o.supporter, 200),
    ...(bool(o.fix) ? { fix: true } : {}),
    ...(section && sections.has(section) ? { section } : {}),
  };
}

function normLearn(v: unknown, sections: Set<string>): MichiLearn | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 40);
  if (!ID_RE.test(id)) return null;
  const section = str(o.section, 20);
  return {
    id,
    category: str(o.category, 40),
    learn: str(o.learn),
    practice: str(o.practice),
    share: str(o.share),
    when: str(o.when, 200),
    ...(bool(o.fix) ? { fix: true } : {}),
    ...(section && sections.has(section) ? { section } : {}),
  };
}

function normSkillItems(v: unknown, levels: MichiLevelId[]): MichiSkillItem[] {
  if (!Array.isArray(v)) return [];
  const out: MichiSkillItem[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = str(o.id, 40);
    if (!ID_RE.test(id) || out.some((i) => i.id === id)) continue;
    const reachIn = (o.reach && typeof o.reach === "object" ? o.reach : {}) as Record<string, unknown>;
    const reach: Record<string, string> = {};
    for (const lv of levels) reach[lv] = str(reachIn[lv], 200);
    out.push({ id, name: str(o.name, 300), reach, ...(bool(o.fix) ? { fix: true } : {}) });
  }
  return out;
}

function uniqById<T extends { id: string }>(rows: (T | null)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/**
 * 管理画面から来た中身を、はじめの中身（base）の形に合わせて整える。
 * 直せるのは「ステップ・学びのステップ・技能の業務一覧・学びの地図の行・【院長が直す】の印」だけ。
 * 段の名前・意味・使い方などの文は base のまま（直せない所は受け取っても使わない）。
 */
export function normalizeEditable(input: unknown, base: MichiContent): MichiContent {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const inLevels = Array.isArray(o.levels) ? (o.levels as Record<string, unknown>[]) : [];
  const levels = base.levels.map((lv) => {
    const src = inLevels.find((x) => x && x.id === lv.id);
    if (!src) return lv;
    const secKeys = new Set(lv.sections.map((s) => s.key));
    return {
      ...lv,
      steps: Array.isArray(src.steps) ? uniqById(src.steps.map((s) => normStep(s, secKeys))) : lv.steps,
      learnings: Array.isArray(src.learnings) ? uniqById(src.learnings.map((s) => normLearn(s, secKeys))) : lv.learnings,
    };
  });
  const inLines = Array.isArray(o.skillLines) ? (o.skillLines as Record<string, unknown>[]) : [];
  const skillLines = base.skillLines.map((l) => {
    const src = inLines.find((x) => x && x.id === l.id);
    return src ? { ...l, items: normSkillItems(src.items, l.columns.map((c) => c.level)) } : l;
  });
  const inRanges = Array.isArray(o.skillRanges) ? (o.skillRanges as Record<string, unknown>[]) : [];
  const skillRanges = base.skillRanges.map((r) => {
    const src = inRanges.find((x) => x && x.id === r.id);
    return src ? { ...r, items: normSkillItems(src.items, r.columns.map((c) => c.level)) } : r;
  });
  const inMap = Array.isArray(o.learnMap) ? (o.learnMap as Record<string, unknown>[]) : [];
  const learnMap = base.learnMap.map((m) => {
    const src = inMap.find((x) => x && x.level === m.level);
    if (!src || !Array.isArray(src.rows)) return m;
    const rows = uniqById(
      (src.rows as unknown[]).map((r) => {
        if (!r || typeof r !== "object") return null;
        const x = r as Record<string, unknown>;
        const id = str(x.id, 40);
        if (!ID_RE.test(id)) return null;
        return { id, kind: str(x.kind, 60), item: str(x.item), when: str(x.when, 200), ...(bool(x.fix) ? { fix: true } : {}) };
      })
    );
    return { ...m, rows };
  });
  return { ...base, levels, skillLines, skillRanges, learnMap };
}

/** 保存されている中身を読む（壊れていたら base を使う）。文の所は保存の値を使う */
export function normalizeStored(stored: unknown, base: MichiContent): MichiContent {
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Partial<MichiContent>;
  const merged = normalizeEditable(stored, base);
  const history = Array.isArray(s.history)
    ? (s.history as unknown[])
        .filter((h): h is MichiHistory => !!h && typeof h === "object" && typeof (h as MichiHistory).at === "string")
        .slice(-MICHI_HISTORY_MAX)
    : [];
  return {
    ...merged,
    updatedAt: str(s.updatedAt, 40),
    updatedBy: str(s.updatedBy, 200),
    updatedByName: str(s.updatedByName, 200),
    history,
  };
}

/** 直した所を短い言葉で（直した記録に残す） */
export function describeChanges(before: MichiContent, after: MichiContent): string {
  const parts: string[] = [];
  for (const lv of after.levels) {
    const b = before.levels.find((x) => x.id === lv.id);
    if (!b) continue;
    if (JSON.stringify(b.steps) !== JSON.stringify(lv.steps)) parts.push(`${lv.id} のステップ`);
    if (JSON.stringify(b.learnings) !== JSON.stringify(lv.learnings)) parts.push(`${lv.id} の学びのステップ`);
  }
  for (const l of after.skillLines) {
    const b = before.skillLines.find((x) => x.id === l.id);
    if (b && JSON.stringify(b.items) !== JSON.stringify(l.items)) parts.push(`技能の業務一覧（${l.label}）`);
  }
  for (const r of after.skillRanges) {
    const b = before.skillRanges.find((x) => x.id === r.id);
    if (b && JSON.stringify(b.items) !== JSON.stringify(r.items)) parts.push(`技能の4段階（${r.title}）`);
  }
  for (const m of after.learnMap) {
    const b = before.learnMap.find((x) => x.level === m.level);
    if (b && JSON.stringify(b.rows) !== JSON.stringify(m.rows)) parts.push(`学びの地図（${m.level}）`);
  }
  return parts.join("・");
}

/** 新しい行の id（段の中で重ならないもの） */
export function nextRowId(prefix: string, existing: readonly string[]): string {
  let n = existing.length + 1;
  for (;;) {
    const id = `${prefix}${String(n).padStart(2, "0")}`;
    if (!existing.includes(id)) return id;
    n++;
  }
}
