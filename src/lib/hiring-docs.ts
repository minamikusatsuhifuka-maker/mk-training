// 採用資料（履歴書・適性検査など）と AI による基本情報の整理（指示書184）— 型・正規化・純関数
//
// 【扱うもの】
//   ・資料（doc）: 種類・資料の日付・メモ・実体（非公開バケット hiring-docs のパス）。原本は院長がそのまま見る
//   ・経歴（profile）: 学歴・職歴・免許・資格／入職時の想い（志望動機・自己PR）。育成カルテに院長のみ表示
//   ・AI の提案（proposal）: 項目ごとの値と根拠（資料のどこから読んだか）。**保存しない**。院長が選んだ分だけを
//     既存のAPI（スタッフ連絡先169・家族構成179-D・ここの profile）へ反映する
//
// 【取り出さない項目（184 3-3・最重要）】
//   本籍・出生地／健康状態・病歴・障害／宗教・思想・信条・支持政党／家族の職業・学歴・収入・資産・氏名・住所・生年月日／
//   顔写真／マイナンバー・銀行口座・保険証番号。
//   AIへの指示（システムプロンプト）と、**このファイルの受け取り処理（ホワイトリスト＋禁止語の行落とし）の両方**で除外する。
//   提案の型に無い項目は受け取り時に落ちる（=構造化データに入らない）。
//
// 【適性検査（184 3-4）】結果の内容は要約・解釈・転記しない。取り出すのは氏名・受検日だけ。
//
// このファイルは "@/" や DB に依存しない。

export const HIRING_DOC_KINDS = [
  { value: "resume", label: "履歴書" },
  { value: "career", label: "職務経歴書" },
  { value: "aptitude", label: "適性検査（スカウター等）" },
  { value: "license", label: "資格証の写し" },
  { value: "interview", label: "面接の記録" },
  { value: "other", label: "その他" },
] as const;
export type HiringDocKind = (typeof HIRING_DOC_KINDS)[number]["value"];

export function isHiringDocKind(v: unknown): v is HiringDocKind {
  return HIRING_DOC_KINDS.some((k) => k.value === v);
}

export function hiringDocKindLabel(v: HiringDocKind): string {
  return HIRING_DOC_KINDS.find((k) => k.value === v)?.label ?? "";
}

export type HiringDoc = {
  id: string;
  userId: string;
  kind: HiringDocKind;
  /** 資料の日付 YYYY-MM-DD（履歴書の作成日・受検日など） */
  docDate: string;
  memo: string;
  /** バケット内のパス（{userId}/{id}.{ext}） */
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
  /** 返すときだけ付く署名URL（10分） */
  signedUrl?: string;
};

export const HIRING_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const HIRING_DOC_MEMO_MAX = 500;
export const HIRING_SIGNED_URL_TTL = 600; // 10分（184 2-2）
export const HIRING_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "text/plain"] as const;
/** 文章の貼り付け（187 B）の上限 */
export const HIRING_TEXT_MAX = 20000;

export function isAllowedHiringMime(mime: string): boolean {
  return (HIRING_MIME_TYPES as readonly string[]).includes(mime);
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function ymd(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : "";
}

export function normalizeHiringDoc(id: string, raw: unknown): HiringDoc | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  const path = text(g.path, 300);
  if (!userId || !path) return null;
  return {
    id,
    userId,
    kind: isHiringDocKind(g.kind) ? g.kind : "other",
    docDate: ymd(g.docDate),
    memo: text(g.memo, HIRING_DOC_MEMO_MAX),
    path,
    fileName: text(g.fileName, 200),
    mimeType: text(g.mimeType, 100),
    size: typeof g.size === "number" && g.size >= 0 ? Math.floor(g.size) : 0,
    uploadedBy: text(g.uploadedBy, 200),
    createdAt: text(g.createdAt, 40),
  };
}

// ─── 経歴・入職時の想い（184 3-2・院長のみ）───

export type HiringProfile = {
  userId: string;
  /** 学歴 */
  education: string;
  /** 職歴 */
  career: string;
  /** 免許・資格 */
  licenses: string;
  /** 志望動機 */
  motivation: string;
  /** 自己PR */
  selfPr: string;
  updatedBy: string;
  updatedAt: string;
};

export const HIRING_PROFILE_FIELDS: { key: keyof HiringProfileText; label: string; group: "経歴" | "入職時の想い" }[] = [
  { key: "education", label: "学歴", group: "経歴" },
  { key: "career", label: "職歴", group: "経歴" },
  { key: "licenses", label: "免許・資格", group: "経歴" },
  { key: "motivation", label: "志望動機", group: "入職時の想い" },
  { key: "selfPr", label: "自己PR", group: "入職時の想い" },
];
export type HiringProfileText = Pick<HiringProfile, "education" | "career" | "licenses" | "motivation" | "selfPr">;
export const HIRING_PROFILE_TEXT_MAX = 4000;

export function hiringProfileId(userId: string): string {
  return `hp-${userId}`;
}

export function emptyHiringProfile(userId: string): HiringProfile {
  return { userId, education: "", career: "", licenses: "", motivation: "", selfPr: "", updatedBy: "", updatedAt: "" };
}

export function normalizeHiringProfile(userId: string, raw: unknown): HiringProfile {
  const base = emptyHiringProfile(userId);
  if (!raw || typeof raw !== "object") return base;
  const g = raw as Record<string, unknown>;
  return {
    ...base,
    education: scrubForbiddenLines(text(g.education, HIRING_PROFILE_TEXT_MAX)),
    career: scrubForbiddenLines(text(g.career, HIRING_PROFILE_TEXT_MAX)),
    licenses: scrubForbiddenLines(text(g.licenses, HIRING_PROFILE_TEXT_MAX)),
    motivation: scrubForbiddenLines(text(g.motivation, HIRING_PROFILE_TEXT_MAX)),
    selfPr: scrubForbiddenLines(text(g.selfPr, HIRING_PROFILE_TEXT_MAX)),
    updatedBy: text(g.updatedBy, 200),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function isEmptyHiringProfile(p: HiringProfile): boolean {
  return !p.education.trim() && !p.career.trim() && !p.licenses.trim() && !p.motivation.trim() && !p.selfPr.trim();
}

// ─── 取り出さない項目（184 3-3）の受け取り側の除外 ───
//
// AIが指示に反して本文に混ぜてきた場合に備え、これらの語を含む**行**を落とす。
// 誤って正当な行を落とす可能性より、機微な記載が構造化データに入る事故を防ぐ方を優先する（原本はそのまま残る）。

export const FORBIDDEN_TERMS: readonly string[] = [
  "本籍",
  "出生地",
  "出身地",
  "健康状態",
  "病歴",
  "既往",
  "持病",
  "通院",
  "障害",
  "障がい",
  "宗教",
  "信仰",
  "思想",
  "信条",
  "支持政党",
  "政党",
  "収入",
  "年収",
  "資産",
  "マイナンバー",
  "個人番号",
  "口座",
  "保険証",
  "被保険者番号",
];

const FORBIDDEN_RE = new RegExp(FORBIDDEN_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));

export function containsForbiddenTerm(s: string): boolean {
  return FORBIDDEN_RE.test(s);
}

/** 禁止語を含む行を落とす（行単位。空行の連続は詰める） */
export function scrubForbiddenLines(s: string): string {
  if (!s) return "";
  return s
    .split("\n")
    .filter((line) => !containsForbiddenTerm(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── AIの提案（184 3-1）───

export type Evidence = string;

export type ProposalText = { value: string; evidence: Evidence };

export type HiringProposal = {
  /** 連絡先（169）へ */
  contact: {
    name?: ProposalText;
    kana?: ProposalText;
    birthday?: ProposalText;
    address?: ProposalText;
    phoneMobile?: ProposalText;
    phoneHome?: ProposalText;
    privateEmail?: ProposalText;
  };
  /** 緊急連絡先（169）へ: 氏名・続柄・電話のみ */
  emergency: { name: string; relation: string; phone: string; evidence: Evidence }[];
  /** 家族構成（179-D）へ: 続柄・人数のみ */
  family: { relation: string; count: string; evidence: Evidence }[];
  /** 経歴・入職時の想い（ここ）へ */
  profile: Partial<Record<keyof HiringProfileText, ProposalText>>;
  /** 適性検査の受検日（資料の日付として使う） */
  testDate?: ProposalText;
  /** AIが読み取れなかった・除外した旨（画面表示用） */
  notes: string[];
};

export const CONTACT_PROPOSAL_KEYS = ["name", "kana", "birthday", "address", "phoneMobile", "phoneHome", "privateEmail"] as const;
export type ContactProposalKey = (typeof CONTACT_PROPOSAL_KEYS)[number];

export const CONTACT_FIELD_LABEL: Record<ContactProposalKey, string> = {
  name: "氏名",
  kana: "ふりがな",
  birthday: "生年月日",
  address: "住所",
  phoneMobile: "電話番号（携帯）",
  phoneHome: "電話番号（自宅）",
  privateEmail: "メールアドレス",
};

function pt(v: unknown, max: number, opts?: { date?: boolean }): ProposalText | undefined {
  if (!v || typeof v !== "object") return undefined;
  const g = v as Record<string, unknown>;
  let value = scrubForbiddenLines(text(g.value, max)).trim();
  if (opts?.date) value = ymd(value);
  if (!value) return undefined;
  const evidence = text(g.evidence, 300).trim();
  return { value, evidence };
}

/**
 * AIの応答（JSON）を提案の形に整える＝**ホワイトリスト**。
 * 型に無い項目・禁止語を含む行・家族の氏名や住所などは、ここで落ちて先に進まない。
 * 適性検査（kind === "aptitude"）は氏名と受検日だけを通す（3-4）。
 */
export function normalizeHiringProposal(raw: unknown, kind: HiringDocKind): HiringProposal {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const notes: string[] = [];
  const out: HiringProposal = { contact: {}, emergency: [], family: [], profile: {}, notes };

  const c = (g.contact && typeof g.contact === "object" ? g.contact : {}) as Record<string, unknown>;
  out.contact.name = pt(c.name, 60);
  out.testDate = pt(g.testDate, 40, { date: true });
  if (kind === "aptitude") {
    notes.push("適性検査の結果の内容は転記しません（原本で確認してください）。氏名と受検日だけを取り出しました。");
    return out;
  }

  out.contact.kana = pt(c.kana, 60);
  out.contact.birthday = pt(c.birthday, 40, { date: true });
  out.contact.address = pt(c.address, 200);
  out.contact.phoneMobile = pt(c.phoneMobile, 30);
  out.contact.phoneHome = pt(c.phoneHome, 30);
  out.contact.privateEmail = pt(c.privateEmail, 200);

  if (Array.isArray(g.emergency)) {
    for (const e of g.emergency.slice(0, 3)) {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const name = text(o.name, 60).trim();
      const relation = text(o.relation, 20).trim();
      const phone = text(o.phone, 30).trim();
      if (!name && !phone) continue;
      if (containsForbiddenTerm(`${name}${relation}${phone}`)) continue;
      out.emergency.push({ name, relation, phone, evidence: text(o.evidence, 300).trim() });
    }
  }
  if (Array.isArray(g.family)) {
    for (const f of g.family.slice(0, 6)) {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      const relation = text(o.relation, 20).trim();
      const countRaw = typeof o.count === "number" ? String(o.count) : text(o.count, 3).trim();
      const count = /^\d{1,2}$/.test(countRaw) ? String(Number(countRaw)) : "";
      if (!relation) continue;
      if (containsForbiddenTerm(relation)) continue;
      // 家族の氏名・職業・住所・生年月日は型に無い＝ここで落ちる
      out.family.push({ relation, count, evidence: text(o.evidence, 300).trim() });
    }
  }
  const p = (g.profile && typeof g.profile === "object" ? g.profile : {}) as Record<string, unknown>;
  for (const f of HIRING_PROFILE_FIELDS) {
    const v = pt(p[f.key], HIRING_PROFILE_TEXT_MAX);
    if (v) out.profile[f.key] = v;
  }
  return out;
}

/** 提案に値が1つでもあるか */
export function proposalHasContent(p: HiringProposal): boolean {
  return (
    Object.values(p.contact).some(Boolean) ||
    p.emergency.length > 0 ||
    p.family.length > 0 ||
    Object.values(p.profile).some(Boolean) ||
    !!p.testDate
  );
}

// ─── 187-補: 提案をその場で修正するための検査（画面と純テストで共用） ───

/** 家族構成の続柄の選択肢（169と同じ「続柄・人数だけ」）。AIが別の語を返したときはその語も選択肢に足す */
export const FAMILY_RELATION_CHOICES = ["配偶者", "子", "父", "母", "祖父", "祖母", "兄弟姉妹", "その他"] as const;

/** 電話番号: 数字10〜11桁（ハイフン・空白・全角は無視）。国番号 + も可 */
export function isValidPhone(v: string): boolean {
  const s = v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-()（）ー－−‐‑–—]/g, "");
  return /^\+?\d{10,13}$/.test(s);
}
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
/** 経歴の「年月」。"2014年4月 入職" → { ym: "2014-04", rest: "入職" }。年月が無ければ ym は空 */
export function splitCareerYm(v: string): { ym: string; rest: string } {
  const m = v.match(/^\s*(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*月?\s*[:：、,\s]*/);
  if (!m) return { ym: "", rest: v.trim() };
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return { ym: "", rest: v.trim() };
  return { ym: `${m[1]}-${String(mm).padStart(2, "0")}`, rest: v.slice(m[0].length).trim() };
}
/** 年月（YYYY-MM）と内容を1行に戻す */
export function joinCareerYm(ym: string, rest: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  const head = m ? `${m[1]}年${Number(m[2])}月` : "";
  return [head, rest.trim()].filter(Boolean).join(" ");
}

// ─── 反映（184 3-1 ④）：院長が選んだ分だけ ───

export type HiringApplyInput = {
  userId: string;
  contact?: Partial<Record<ContactProposalKey, string>>;
  emergency?: { name: string; relation: string; phone: string }[];
  family?: { relation: string; count: string }[];
  profile?: Partial<Record<keyof HiringProfileText, { value: string; mode: "replace" | "append" }>>;
};

/** 反映の入力をホワイトリストで整える（クライアント値を信じない） */
export function normalizeHiringApply(raw: unknown): HiringApplyInput | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  if (!userId) return null;
  const out: HiringApplyInput = { userId };
  if (g.contact && typeof g.contact === "object") {
    const c = g.contact as Record<string, unknown>;
    const contact: HiringApplyInput["contact"] = {};
    for (const k of CONTACT_PROPOSAL_KEYS) {
      const v = k === "birthday" ? ymd(c[k]) : scrubForbiddenLines(text(c[k], 200)).trim();
      if (v) contact[k] = v;
    }
    if (Object.keys(contact).length > 0) out.contact = contact;
  }
  if (Array.isArray(g.emergency)) {
    out.emergency = g.emergency
      .slice(0, 3)
      .map((e) => {
        const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
        return { name: text(o.name, 60).trim(), relation: text(o.relation, 20).trim(), phone: text(o.phone, 30).trim() };
      })
      .filter((e) => (e.name || e.phone) && !containsForbiddenTerm(`${e.name}${e.relation}${e.phone}`));
  }
  if (Array.isArray(g.family)) {
    out.family = g.family
      .slice(0, 6)
      .map((f) => {
        const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const countRaw = typeof o.count === "number" ? String(o.count) : text(o.count, 3).trim();
        return { relation: text(o.relation, 20).trim(), count: /^\d{1,2}$/.test(countRaw) ? String(Number(countRaw)) : "" };
      })
      .filter((f) => f.relation && !containsForbiddenTerm(f.relation));
  }
  if (g.profile && typeof g.profile === "object") {
    const p = g.profile as Record<string, unknown>;
    const profile: HiringApplyInput["profile"] = {};
    for (const f of HIRING_PROFILE_FIELDS) {
      const o = p[f.key];
      if (!o || typeof o !== "object") continue;
      const oo = o as Record<string, unknown>;
      const value = scrubForbiddenLines(text(oo.value, HIRING_PROFILE_TEXT_MAX)).trim();
      if (!value) continue;
      profile[f.key] = { value, mode: oo.mode === "replace" ? "replace" : "append" };
    }
    if (Object.keys(profile).length > 0) out.profile = profile;
  }
  return out;
}

/** 追記: 既存が空なら置換、あれば改行で足す */
export function mergeText(existing: string, incoming: string, mode: "replace" | "append"): string {
  if (mode === "replace" || !existing.trim()) return incoming;
  return `${existing.trimEnd()}\n${incoming}`.slice(0, HIRING_PROFILE_TEXT_MAX);
}

// ─── AIへの指示（184 3-3/3-4 を明記）───

export const HIRING_EXTRACT_SYSTEM = `あなたはクリニックの人事担当を補助し、採用時の資料（履歴書・職務経歴書・資格証など）から**基本情報だけ**を読み取ってJSONで返します。

【最重要ルール（違反禁止）】
- 資料に書かれていないことは絶対に書かない。推測・一般論・創作をしない。読み取れない項目は省略する。
- 各項目には evidence（資料のどこから読んだか。例: 「履歴書 1ページ目 右上」「職歴欄 2行目」）を必ず付ける。
- **次の項目は、資料に記載があっても絶対に出力しない**（該当する語があっても無視する）:
  本籍・出生地・出身地／健康状態・病歴・既往歴・障害／宗教・思想・信条・支持政党／
  家族の職業・学歴・収入・資産・氏名・住所・生年月日／顔写真の説明／マイナンバー（個人番号）・銀行口座・保険証番号。
- 家族構成は「続柄と人数」だけ（例: 配偶者 1、子 2）。家族の氏名・年齢・職業は出さない。
- 緊急連絡先は「氏名・続柄・電話番号」だけ。
- 適性検査・性格検査・スカウター等の結果は、内容を要約・解釈・転記しない。取り出すのは受検者の氏名と受検日だけ。
- 日付は YYYY-MM-DD。年が読み取れないときは省略する。
- 志望動機・自己PR・学歴・職歴・免許資格は、資料の言葉のまま（要約しない）。
- 面接の記録（本人の発言と面接官の所感が混ざる文章）では、**本人が述べた事実だけ**を取り出す。面接官・院長の所感・評価・印象・判断（「〜と感じた」「〜そうだ」「合格」「採用したい」など）は一切出力しない。

【出力JSON（この形だけ。無い項目はキーごと省略）】
{
  "contact": {
    "name": {"value": "氏名", "evidence": "..."},
    "kana": {"value": "ふりがな", "evidence": "..."},
    "birthday": {"value": "YYYY-MM-DD", "evidence": "..."},
    "address": {"value": "住所", "evidence": "..."},
    "phoneMobile": {"value": "携帯電話", "evidence": "..."},
    "phoneHome": {"value": "自宅電話", "evidence": "..."},
    "privateEmail": {"value": "メールアドレス", "evidence": "..."}
  },
  "emergency": [{"name": "氏名", "relation": "続柄", "phone": "電話番号", "evidence": "..."}],
  "family": [{"relation": "続柄", "count": 1, "evidence": "..."}],
  "profile": {
    "education": {"value": "学歴（資料の言葉のまま・改行区切り）", "evidence": "..."},
    "career": {"value": "職歴", "evidence": "..."},
    "licenses": {"value": "免許・資格", "evidence": "..."},
    "motivation": {"value": "志望動機", "evidence": "..."},
    "selfPr": {"value": "自己PR", "evidence": "..."}
  },
  "testDate": {"value": "YYYY-MM-DD（適性検査の受検日。無ければ省略）", "evidence": "..."}
}`;

// ─── 入職予定者（187 C）───
//
// アカウント作成前（内定〜入職前）の人。対象は**内定後のみ**（選考中の応募者は登録しない）。
// 採用資料・経歴・連絡先は「userId = 入職予定者id（prospect-…）」で持ち、アカウントに紐づけたときに
// 本物の userId へ付け替える。閲覧は院長のみ（183の幹部にも出さない・委任不可）。

export type ProspectStatus = "expected" | "linked" | "declined";

export type Prospect = {
  id: string;
  name: string;
  /** アカウントとの照合に使うメールアドレス（任意） */
  email: string;
  /** 入職予定日 YYYY-MM-DD */
  expectedJoinOn: string;
  status: ProspectStatus;
  /** 紐づけたアカウントの userId（linked のとき） */
  linkedUserId: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export const PROSPECT_PREFIX = "prospect-";
/** 入職予定日からこの日数たっても紐づかないときに確認を促す（自動削除はしない） */
export const PROSPECT_STALE_DAYS = 60;

export function isProspectId(userId: string): boolean {
  return userId.startsWith(PROSPECT_PREFIX);
}

export function normalizeProspect(id: string, raw: unknown): Prospect | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const name = text(g.name, 60).trim();
  if (!name) return null;
  return {
    id,
    name,
    email: text(g.email, 200).trim().toLowerCase(),
    expectedJoinOn: ymd(g.expectedJoinOn),
    status: g.status === "linked" ? "linked" : g.status === "declined" ? "declined" : "expected",
    linkedUserId: text(g.linkedUserId, 100),
    memo: text(g.memo, 500),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

/** 入職予定日から PROSPECT_STALE_DAYS を過ぎても紐づいていないか */
export function isProspectStale(p: Prospect, today: string): boolean {
  if (p.status !== "expected" || !p.expectedJoinOn || !ymd(today)) return false;
  const [y, m, d] = p.expectedJoinOn.split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1, d + PROSPECT_STALE_DAYS)).toISOString().slice(0, 10);
  return today > limit;
}

// ─── 操作ログ ───

export type HiringLog = {
  id: string;
  at: string;
  by: string;
  action: string;
  target: string;
  changes: { field: string; before: string; after: string }[];
};

export function normalizeHiringLog(id: string, raw: unknown): HiringLog | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const rawChanges = Array.isArray(g.changes) ? g.changes : [];
  return {
    id,
    at: text(g.at, 40),
    by: text(g.by, 200),
    action: text(g.action, 40),
    target: text(g.target, 200),
    changes: rawChanges.slice(0, 40).map((c) => {
      const e = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { field: text(e.field, 60), before: text(e.before, 200), after: text(e.after, 200) };
    }),
  };
}
