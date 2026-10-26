// 🧭 成長の道しるべ 第2部（指示書270 §3）— 一人ひとりの進み具合（型と純関数・依存なし）
//
// 【保存】clinic_staff_growth の record_type "michi_progress"、1人1行（id = mp-<userId>）。新しい表もSQLも足さない。
// 【誰が何を付けるか】判定はここ（applyMichiOp）1か所。API はこの結果に従うだけ。
//   今いる段                … 院長だけ（段を変えたら日付と一緒に「段の歩み」に残す）
//   ステップの状態           … これから／取り組み中／できた は本人。「できた」には根拠となる事実（200字まで・必須）
//                             確認済み（確かめた）は院長と、その人の1on1を担当する幹部（本人は付けられない）
//   技能の4段階              … ①② は本人、③④ は確かめる人（院長・担当の幹部）
//   学びの3点セット          … ①学ぶ ②実践 ③分かち合う とひとことは本人。確認済みの印は確かめる人
//   半期の目標               … 本人が、今の段のステップから3つまで
// 状態の言葉はアプリにすでにある言葉（1on1の約束の「これから・取り組み中・できた」、講座の「確認済み」）を使う（270 §3-3）。

export const MICHI_PROGRESS_TYPE = "michi_progress";
export const MICHI_EVIDENCE_MAX = 200;
export const MICHI_NOTE_MAX = 200;
export const MICHI_HALF_GOALS_MAX = 3;

export const MICHI_STEP_STATUSES = [
  { value: "todo", label: "これから" },
  { value: "doing", label: "取り組み中" },
  { value: "done", label: "できた" },
  { value: "confirmed", label: "確認済み" },
] as const;
export type MichiStepStatus = (typeof MICHI_STEP_STATUSES)[number]["value"];

export function stepStatusLabel(s: MichiStepStatus): string {
  return MICHI_STEP_STATUSES.find((x) => x.value === s)?.label ?? "";
}

/** 技能の4段階（0＝まだ付けていない） */
export const SKILL_STAGES = ["", "①見学", "②支えがあればできる", "③一人でできる", "④教えられる"] as const;
export const STAGE_MARKS = ["", "①", "②", "③", "④"] as const;

export type MichiMark = { by: string; byName: string; at: string };

export type MichiStepProgress = {
  status: MichiStepStatus;
  /** 根拠となる事実（「できた」にするとき本人が書く） */
  evidence: string;
  doneAt: string;
  confirmed?: MichiMark;
  updatedAt: string;
};

export type MichiSkillProgress = { stage: number } & MichiMark;

export type MichiLearnProgress = {
  learn: boolean;
  practice: boolean;
  share: boolean;
  /** ひとこと（実践した場面・分かち合った場所） */
  note: string;
  confirmed?: MichiMark;
  updatedAt: string;
};

export type MichiLevelChange = { level: string; at: string } & Omit<MichiMark, "at">;

export type MichiProgress = {
  userId: string;
  /** 今いる段（"" ＝まだ決めていません） */
  level: string;
  levelHistory: MichiLevelChange[];
  steps: Record<string, MichiStepProgress>;
  skills: Record<string, MichiSkillProgress>;
  learns: Record<string, MichiLearnProgress>;
  halfGoals: string[];
  testSeed?: true;
  updatedAt: string;
};

export const NOT_DECIDED_LABEL = "まだ決めていません";

export function emptyProgress(userId: string): MichiProgress {
  return { userId, level: "", levelHistory: [], steps: {}, skills: {}, learns: {}, halfGoals: [], updatedAt: "" };
}

const str = (v: unknown, max = 400): string => (typeof v === "string" ? v.slice(0, max) : "");
const KEY_RE = /^[A-Za-z0-9+_.-]{1,40}$/;

function mark(v: unknown): MichiMark | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const by = str(o.by, 80);
  const at = str(o.at, 40);
  return by && at ? { by, byName: str(o.byName, 200), at } : undefined;
}

function isStatus(v: unknown): v is MichiStepStatus {
  return MICHI_STEP_STATUSES.some((s) => s.value === v);
}

export function normalizeProgress(raw: unknown, userId: string): MichiProgress {
  const base = emptyProgress(userId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const steps: Record<string, MichiStepProgress> = {};
  for (const [k, v] of Object.entries((o.steps && typeof o.steps === "object" ? o.steps : {}) as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const status = isStatus(x.status) ? x.status : "todo";
    const confirmed = mark(x.confirmed);
    steps[k] = {
      status: status === "confirmed" && !confirmed ? "done" : status,
      evidence: str(x.evidence, MICHI_EVIDENCE_MAX),
      doneAt: str(x.doneAt, 40),
      ...(status === "confirmed" && confirmed ? { confirmed } : {}),
      updatedAt: str(x.updatedAt, 40),
    };
  }
  const skills: Record<string, MichiSkillProgress> = {};
  for (const [k, v] of Object.entries((o.skills && typeof o.skills === "object" ? o.skills : {}) as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const stage = typeof x.stage === "number" && Number.isInteger(x.stage) && x.stage >= 1 && x.stage <= 4 ? x.stage : 0;
    const m = mark(x);
    if (stage && m) skills[k] = { stage, ...m };
  }
  const learns: Record<string, MichiLearnProgress> = {};
  for (const [k, v] of Object.entries((o.learns && typeof o.learns === "object" ? o.learns : {}) as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const confirmed = mark(x.confirmed);
    learns[k] = {
      learn: x.learn === true,
      practice: x.practice === true,
      share: x.share === true,
      note: str(x.note, MICHI_NOTE_MAX),
      ...(confirmed ? { confirmed } : {}),
      updatedAt: str(x.updatedAt, 40),
    };
  }
  const levelHistory = Array.isArray(o.levelHistory)
    ? (o.levelHistory as unknown[])
        .map((h) => {
          const m = mark(h);
          const level = h && typeof h === "object" ? str((h as Record<string, unknown>).level, 10) : "";
          return m ? { level, by: m.by, byName: m.byName, at: m.at } : null;
        })
        .filter((h): h is MichiLevelChange => h !== null)
        .slice(-100)
    : [];
  const halfGoals = Array.isArray(o.halfGoals)
    ? [...new Set((o.halfGoals as unknown[]).filter((x): x is string => typeof x === "string" && KEY_RE.test(x)))].slice(0, MICHI_HALF_GOALS_MAX)
    : [];
  return {
    userId,
    level: str(o.level, 10),
    levelHistory,
    steps,
    skills,
    learns,
    halfGoals,
    ...(o.testSeed === true ? { testSeed: true as const } : {}),
    updatedAt: str(o.updatedAt, 40),
  };
}

// ─── 付けられるか ───

/** 見ている人の立場（API がサーバーで決めて渡す） */
export type MichiActor = {
  id: string;
  name: string;
  /** 本人か */
  isSelf: boolean;
  /** 確かめる人か（院長、またはその人の1on1を担当する幹部。本人は含まない） */
  canConfirm: boolean;
  /** 今いる段を決められるか（院長だけ） */
  canSetLevel: boolean;
};

/** 操作の対象として正しいか（道しるべの中身を見て、API が作る） */
export type MichiCatalog = {
  levels: readonly string[];
  /** 段ごとのステップの id */
  stepsOf: (level: string) => readonly string[];
  /** 段ごとの学びのステップの id */
  learnsOf: (level: string) => readonly string[];
  /** 業務（技能）の id */
  skillIds: readonly string[];
};

export type MichiOp =
  | { op: "level"; level: string }
  | { op: "step"; stepId: string; status: MichiStepStatus; evidence?: string }
  | { op: "skill"; skillId: string; stage: number }
  | { op: "learn"; learnId: string; learn: boolean; practice: boolean; share: boolean; note: string }
  | { op: "learnConfirm"; learnId: string; confirmed: boolean }
  | { op: "half"; stepIds: string[] };

export function parseMichiOp(body: unknown): MichiOp | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  switch (b.op) {
    case "level":
      return { op: "level", level: str(b.level, 10) };
    case "step":
      return isStatus(b.status) ? { op: "step", stepId: str(b.stepId, 40), status: b.status, evidence: str(b.evidence, 1000) } : null;
    case "skill":
      return typeof b.stage === "number" ? { op: "skill", skillId: str(b.skillId, 40), stage: b.stage } : null;
    case "learn":
      return { op: "learn", learnId: str(b.learnId, 40), learn: b.learn === true, practice: b.practice === true, share: b.share === true, note: str(b.note, 1000) };
    case "learnConfirm":
      return { op: "learnConfirm", learnId: str(b.learnId, 40), confirmed: b.confirmed === true };
    case "half":
      return Array.isArray(b.stepIds) ? { op: "half", stepIds: (b.stepIds as unknown[]).filter((x): x is string => typeof x === "string") } : null;
    default:
      return null;
  }
}

export type ApplyResult = { ok: true; progress: MichiProgress } | { ok: false; status: 400 | 403; error: string };

const forbid = (error = "この操作はできません"): ApplyResult => ({ ok: false, status: 403, error });
const bad = (error: string): ApplyResult => ({ ok: false, status: 400, error });

/** 今の段と次の段のステップ（「次の段も見るだけ」なので、付けられるのは今の段だけ） */
function currentSteps(p: MichiProgress, cat: MichiCatalog): readonly string[] {
  return p.level ? cat.stepsOf(p.level) : [];
}

/**
 * 操作を1つ当てる（誰が・何を付けられるかの判定はここだけ）。
 * now は ISO 文字列（呼び出し側が渡す＝確かめやすい）。
 */
export function applyMichiOp(p: MichiProgress, op: MichiOp, actor: MichiActor, cat: MichiCatalog, now: string): ApplyResult {
  const me = { by: actor.id, byName: actor.name, at: now };
  switch (op.op) {
    case "level": {
      if (!actor.canSetLevel) return forbid("今いる段を決められるのは院長だけです");
      if (op.level !== "" && !cat.levels.includes(op.level)) return bad("段が正しくありません");
      if (op.level === p.level) return { ok: true, progress: p };
      return {
        ok: true,
        progress: {
          ...p,
          level: op.level,
          levelHistory: [...p.levelHistory, { level: op.level, by: me.by, byName: me.byName, at: now }].slice(-100),
          // 段が変わったら、半期の目標は新しい段から選び直す
          halfGoals: p.halfGoals.filter((id) => cat.stepsOf(op.level).includes(id)),
          updatedAt: now,
        },
      };
    }
    case "step": {
      if (!p.level) return bad("今いる段がまだ決まっていません");
      if (!currentSteps(p, cat).includes(op.stepId)) return bad("今の段のステップではありません");
      const prev = p.steps[op.stepId] ?? { status: "todo" as const, evidence: "", doneAt: "", updatedAt: "" };
      let next: MichiStepProgress;
      if (op.status === "confirmed") {
        if (!actor.canConfirm) return forbid("「確認済み」を付けられるのは、院長と1on1を担当する人だけです");
        if (prev.status !== "done" && prev.status !== "confirmed") return bad("本人が「できた」にしたステップだけ確かめられます");
        next = { ...prev, status: "confirmed", confirmed: me, updatedAt: now };
      } else if (actor.isSelf) {
        if (prev.status === "confirmed") return forbid("確認済みのステップは、確かめた人が外すまで変えられません");
        if (op.status === "done") {
          const ev = (op.evidence ?? "").trim();
          if (!ev) return bad("「できた」にするときは、根拠となる事実を書いてください");
          if (ev.length > MICHI_EVIDENCE_MAX) return bad(`根拠となる事実は${MICHI_EVIDENCE_MAX}字までです`);
          next = { status: "done", evidence: ev, doneAt: now, updatedAt: now };
        } else {
          next = { status: op.status, evidence: prev.evidence, doneAt: "", updatedAt: now };
        }
      } else if (actor.canConfirm && op.status === "done" && prev.status === "confirmed") {
        // 確かめる人が「確認済み」を外す（できた に戻す）
        const { confirmed: _c, ...rest } = prev;
        void _c;
        next = { ...rest, status: "done", updatedAt: now };
      } else {
        return forbid();
      }
      return { ok: true, progress: { ...p, steps: { ...p.steps, [op.stepId]: next }, updatedAt: now } };
    }
    case "skill": {
      if (!cat.skillIds.includes(op.skillId)) return bad("業務が正しくありません");
      if (!Number.isInteger(op.stage) || op.stage < 0 || op.stage > 4) return bad("段階が正しくありません");
      const prev = p.skills[op.skillId];
      const prevStage = prev?.stage ?? 0;
      if (!actor.canConfirm) {
        if (!actor.isSelf) return forbid();
        if (op.stage > 2) return forbid("③④を付けられるのは、院長と1on1を担当する人だけです");
        if (prevStage > 2) return forbid("③④は、確かめた人が変えます");
      }
      const skills = { ...p.skills };
      if (op.stage === 0) delete skills[op.skillId];
      else skills[op.skillId] = { stage: op.stage, ...me };
      return { ok: true, progress: { ...p, skills, updatedAt: now } };
    }
    case "learn": {
      if (!actor.isSelf) return forbid("学びの3点セットは本人が付けます");
      if (!p.level || !cat.learnsOf(p.level).includes(op.learnId)) return bad("今の段の学びのステップではありません");
      const note = op.note.trim();
      if (note.length > MICHI_NOTE_MAX) return bad(`ひとことは${MICHI_NOTE_MAX}字までです`);
      const prev = p.learns[op.learnId];
      const all = op.learn && op.practice && op.share;
      const next: MichiLearnProgress = {
        learn: op.learn,
        practice: op.practice,
        share: op.share,
        note,
        // 3つそろっていなくなったら、確認済みの印も外す
        ...(all && prev?.confirmed ? { confirmed: prev.confirmed } : {}),
        updatedAt: now,
      };
      return { ok: true, progress: { ...p, learns: { ...p.learns, [op.learnId]: next }, updatedAt: now } };
    }
    case "learnConfirm": {
      if (!actor.canConfirm) return forbid("確かめられるのは、院長と1on1を担当する人だけです");
      const prev = p.learns[op.learnId];
      if (!prev) return bad("まだ付けられていない学びです");
      if (op.confirmed && !(prev.learn && prev.practice && prev.share)) return bad("3つそろってから確かめられます");
      const { confirmed: _c, ...rest } = prev;
      void _c;
      const next: MichiLearnProgress = op.confirmed ? { ...rest, confirmed: me, updatedAt: now } : { ...rest, updatedAt: now };
      return { ok: true, progress: { ...p, learns: { ...p.learns, [op.learnId]: next }, updatedAt: now } };
    }
    case "half": {
      if (!actor.isSelf) return forbid("半期の目標は本人が選びます");
      const ids = [...new Set(op.stepIds)];
      if (ids.length > MICHI_HALF_GOALS_MAX) return bad(`半期の目標は${MICHI_HALF_GOALS_MAX}つまでです`);
      const cur = currentSteps(p, cat);
      if (ids.some((id) => !cur.includes(id))) return bad("今の段のステップから選んでください");
      return { ok: true, progress: { ...p, halfGoals: ids, updatedAt: now } };
    }
  }
}

// ─── 数える・印 ───

export function stepStatusOf(p: MichiProgress, stepId: string): MichiStepStatus {
  return p.steps[stepId]?.status ?? "todo";
}

/** この段のステップ ○/○ 確認済み */
export function confirmedCount(p: MichiProgress, stepIds: readonly string[]): { confirmed: number; total: number } {
  return { confirmed: stepIds.filter((id) => stepStatusOf(p, id) === "confirmed").length, total: stepIds.length };
}

/** 確かめを待っているステップ（本人が「できた」にして、まだ確かめていないもの・今の段だけ） */
export function pendingCount(p: MichiProgress, stepIds: readonly string[]): number {
  return stepIds.filter((id) => stepStatusOf(p, id) === "done").length;
}

export function learnComplete(l: MichiLearnProgress | undefined): boolean {
  return !!l && l.learn && l.practice && l.share;
}

/** 「③（美容から1つ）」→ 3。読めなければ 0 */
export function stageFromReach(reach: string | undefined): number {
  const c = (reach ?? "").trim().charAt(0);
  const i = (STAGE_MARKS as readonly string[]).indexOf(c);
  return i > 0 ? i : 0;
}

/** 次の段（G1 → G1+ …）。いちばん上は "" */
export function nextLevelOf(levels: readonly string[], level: string): string {
  const i = levels.indexOf(level);
  return i >= 0 && i < levels.length - 1 ? levels[i + 1] : "";
}

/** キャリアライン（現在地の「看護師」「マルチタスク医療事務」）→ 技能の業務一覧のライン */
export function skillLineIdsFor(careerLine: string): string[] {
  if (careerLine === "看護師") return ["nurse"];
  if (careerLine === "マルチタスク医療事務") return ["clerk"];
  return ["nurse", "clerk"];
}
