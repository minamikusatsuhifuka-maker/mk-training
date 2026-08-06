// 資料庫の重複検出（指示書147）
// 判定は**決定的ルールのみ**で行う（AIの類似判定は使わない）。理由:
// - 同じ入力なら必ず同じ結果になり、院長が「なぜこれが候補なのか」を検証できる
// - 削除という不可逆操作の根拠を、あとから機械的に再現できる
// ここは純関数のみ。ファイルの実体（サイズ・ハッシュ）取得はAPI側が担当する。

import type { LibraryDoc } from "./library";

/** 重複の種別 */
export type DupKind =
  /** ファイル実体が同一（ハッシュ一致）かつファイル名も同じ */
  | "exact"
  /** ファイル実体が同一（ハッシュ一致）だがファイル名が違う */
  | "sameContentDiffName"
  /** 正規化タイトルが完全一致するが実体は別（＝別バージョン） */
  | "sameTitle"
  /** 正規化タイトルが高い類似度だが実体は別（＝別バージョンの可能性・要確認） */
  | "similarTitle";

/** 実体が同一と確定している種別（削除しても内容が失われない） */
export function isContentIdentical(kind: DupKind): boolean {
  return kind === "exact" || kind === "sameContentDiffName";
}

export type CleanupMember = {
  doc: LibraryDoc;
  /** Storage 実体のバイト数（不明・link型は 0） */
  size: number;
  /** 実体の SHA-256（未算出・link型は ""） */
  hash: string;
  /** 検索メタデータの充実度スコア */
  metaScore: number;
};

export type CleanupGroup = {
  /** 安定したグループID（メンバーのdocIdを並べたもの） */
  key: string;
  kind: DupKind;
  members: CleanupMember[];
  /** 残す推奨のdocId */
  keepId: string;
  /** 推奨の根拠（1行） */
  keepReason: string;
  /** 類似度（similarTitle のときだけ 0〜1） */
  similarity?: number;
};

// ── タイトルの正規化 ───────────────────────────────────────────

const EXT_RE = /\.(docx?|pdf|pptx?|xlsx?|txt|csv)$/i;
/** 先頭に付きがちな記号・日付プレフィックス（◎260119 など） */
const LEAD_MARK_RE = /^[◎〇○●★☆※\s]*(?:\d{6}|\d{8})?[\s_-]*/u;
/** 末尾の付番（(1) / （2） / のコピー / copy / _ ） */
const TAIL_DUP_RE =
  /(?:[\s_-]*(?:\(|（)\s*\d+\s*(?:\)|）)|のコピー|[\s_-]*copy|[\s_-]*コピー|_)+$/giu;

/** 全角英数・記号を半角に寄せ、空白を落とす */
function toCompact(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

/** 重複判定用のタイトル正規化（拡張子・付番・先頭記号・空白を無視） */
export function normalizeTitleForDup(doc: LibraryDoc): string {
  const base = (doc.title || doc.fileName || "").trim();
  let s = base.replace(EXT_RE, "");
  s = s.replace(LEAD_MARK_RE, "");
  // 付番・コピー表記は繰り返し落とす（「〜 (1) のコピー」対策）
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(TAIL_DUP_RE, "");
  }
  return toCompact(s);
}

// ── 類似度（文字bigramのJaccard係数） ─────────────────────────

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 「別バージョンかも」として提示する下限。低くすると別施術の同意書を誤検出しやすい */
export const SIMILARITY_THRESHOLD = 0.65;

// ── 検索メタデータの充実度 ────────────────────────────────────

export function metaScoreOf(doc: LibraryDoc): number {
  let s = 0;
  if (doc.summary && doc.summary.trim()) s += 3;
  s += Math.min(doc.keywords?.length ?? 0, 10) * 0.5;
  s += Math.min((doc.searchText?.length ?? 0) / 500, 4);
  if ((doc.treatments?.length ?? 0) > 0) s += 1;
  if (doc.category && doc.category !== "その他") s += 2;
  s += Math.min(doc.versions?.length ?? 0, 4) * 0.5;
  if (doc.reviewDueAt) s += 0.5;
  return Math.round(s * 100) / 100;
}

/** ファイル名の「重複らしさ」ペナルティ（大きいほど消す候補） */
function nameNoisePenalty(doc: LibraryDoc): number {
  const n = doc.fileName || "";
  let p = 0;
  if (/のコピー|コピー|copy/i.test(n)) p += 2;
  if (/(\(|（)\s*\d+\s*(\)|）)/.test(n)) p += 1;
  return p;
}

// ── 残す推奨の決定 ────────────────────────────────────────────

/**
 * 残す1件を決める。優先順（指示書147: 検索メタデータが充実 / 新しい方）:
 *  1. 検索メタデータのスコアが高い（AIが中身を読めている＝検索・AI院長で活きる）
 *  2. ファイル名にコピー・付番が付いていない
 *  3. 登録が新しい
 *  4. docId（完全同点時の安定化）
 */
export function pickKeep(members: CleanupMember[]): {
  keepId: string;
  keepReason: string;
} {
  const sorted = members.slice().sort((a, b) => {
    if (b.metaScore !== a.metaScore) return b.metaScore - a.metaScore;
    const pa = nameNoisePenalty(a.doc);
    const pb = nameNoisePenalty(b.doc);
    if (pa !== pb) return pa - pb;
    const ta = a.doc.uploadedAt || "";
    const tb = b.doc.uploadedAt || "";
    if (tb !== ta) return tb.localeCompare(ta);
    return a.doc.id.localeCompare(b.doc.id);
  });
  const keep = sorted[0];
  const other = sorted[1];

  let keepReason = "";
  if (other) {
    if (keep.metaScore > other.metaScore) {
      keepReason = `検索メタデータが充実（要約・キーワード・本文のスコア ${keep.metaScore} > ${other.metaScore}）`;
    } else if (nameNoisePenalty(keep.doc) < nameNoisePenalty(other.doc)) {
      keepReason = "ファイル名にコピー・付番が付いていない";
    } else if ((keep.doc.uploadedAt || "") > (other.doc.uploadedAt || "")) {
      keepReason = "登録が新しい（メタデータは同等）";
    } else {
      keepReason = "内容・メタデータが同等（どれを残しても同じ）";
    }
    if (keep.doc.category !== "その他" && other.doc.category === "その他") {
      keepReason += "／カテゴリが正しく設定されている";
    }
  }
  return { keepId: keep.doc.id, keepReason };
}

// ── グループ化 ────────────────────────────────────────────────

export function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join("|");
}

/** グループ内の全ペアが「重複ではない」と記録済みなら、そのグループは出さない */
function allPairsDismissed(ids: string[], dismissed: Set<string>): boolean {
  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push(pairKey(ids[i], ids[j]));
  }
  return pairs.length > 0 && pairs.every((p) => dismissed.has(p));
}

function groupKeyOf(ids: string[]): string {
  return ids.slice().sort().join("|");
}

/**
 * 重複候補をグループ化する。
 * 実体一致（ハッシュ）→ 正規化タイトル一致 → 類似タイトル の順に判定し、
 * すでに上位で拾ったドキュメントは下位の判定に回さない（二重掲示を防ぐ）。
 */
export function buildCleanupGroups(
  members: CleanupMember[],
  dismissedPairs: string[] = []
): CleanupGroup[] {
  const dismissed = new Set(dismissedPairs);
  const used = new Set<string>();
  const groups: CleanupGroup[] = [];

  const push = (
    kind: DupKind,
    ms: CleanupMember[],
    similarity?: number
  ): void => {
    const ids = ms.map((m) => m.doc.id);
    if (ids.length < 2) return;
    if (allPairsDismissed(ids, dismissed)) return;
    const { keepId, keepReason } = pickKeep(ms);
    groups.push({
      key: groupKeyOf(ids),
      kind,
      members: ms,
      keepId,
      keepReason,
      ...(similarity !== undefined ? { similarity } : {}),
    });
    for (const id of ids) used.add(id);
  };

  // ① 実体が同一（ハッシュ一致）
  const byHash = new Map<string, CleanupMember[]>();
  for (const m of members) {
    if (!m.hash) continue;
    const arr = byHash.get(m.hash) ?? [];
    arr.push(m);
    byHash.set(m.hash, arr);
  }
  for (const arr of byHash.values()) {
    if (arr.length < 2) continue;
    const names = new Set(arr.map((m) => (m.doc.fileName || "").trim()));
    push(names.size === 1 ? "exact" : "sameContentDiffName", arr);
  }

  // ② 正規化タイトルが完全一致（実体は別）
  //   さらに、同じ資料の「表記が少し違う版」を取りこぼさないよう、
  //   未使用のドキュメントのうちタイトルが高類似のものをこのグループに吸収する
  //   （例: 「〜同意書（良性病変除去）」に「〜同意書（良性病変除去、いぼ、ホクロ）」を寄せる）。
  //   吸収が起きたグループは実体が別物なので「要確認」の扱いに落とす。
  const byTitle = new Map<string, CleanupMember[]>();
  for (const m of members) {
    if (used.has(m.doc.id)) continue;
    const t = normalizeTitleForDup(m.doc);
    if (!t) continue;
    const arr = byTitle.get(t) ?? [];
    arr.push(m);
    byTitle.set(t, arr);
  }
  for (const [title, arr] of byTitle.entries()) {
    if (arr.length < 2) continue;
    const memberIds = new Set(arr.map((m) => m.doc.id));
    const absorbed: CleanupMember[] = [];
    let minSim = 1;
    for (const m of members) {
      if (used.has(m.doc.id) || memberIds.has(m.doc.id)) continue;
      // 単独タイトルのものだけを吸収対象にする（別の同名グループを飲み込まない）
      if ((byTitle.get(normalizeTitleForDup(m.doc))?.length ?? 0) >= 2) continue;
      const sim = titleSimilarity(title, normalizeTitleForDup(m.doc));
      if (sim >= SIMILARITY_THRESHOLD) {
        absorbed.push(m);
        minSim = Math.min(minSim, sim);
      }
    }
    if (absorbed.length > 0) {
      push(
        "similarTitle",
        [...arr, ...absorbed],
        Math.round(minSim * 100) / 100
      );
    } else {
      push("sameTitle", arr);
    }
  }

  // ③ タイトルが高類似（実体は別・要確認）
  const rest = members.filter((m) => !used.has(m.doc.id));
  for (let i = 0; i < rest.length; i++) {
    if (used.has(rest[i].doc.id)) continue;
    const ti = normalizeTitleForDup(rest[i].doc);
    if (!ti) continue;
    const bucket = [rest[i]];
    let minSim = 1;
    for (let j = i + 1; j < rest.length; j++) {
      if (used.has(rest[j].doc.id)) continue;
      const sim = titleSimilarity(ti, normalizeTitleForDup(rest[j].doc));
      if (sim >= SIMILARITY_THRESHOLD) {
        bucket.push(rest[j]);
        minSim = Math.min(minSim, sim);
      }
    }
    if (bucket.length >= 2) {
      push("similarTitle", bucket, Math.round(minSim * 100) / 100);
    }
  }

  // 実体同一（＝消しても内容が失われない）を先に見せる
  const rank: Record<DupKind, number> = {
    exact: 0,
    sameContentDiffName: 1,
    sameTitle: 2,
    similarTitle: 3,
  };
  return groups.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export const DUP_KIND_META: Record<
  DupKind,
  { label: string; desc: string; safeForBulk: boolean }
> = {
  exact: {
    label: "完全重複",
    desc: "ファイルの中身もファイル名も同一。残す1件以外を消しても失われるものはありません。",
    safeForBulk: true,
  },
  sameContentDiffName: {
    label: "中身同一・名前違い",
    desc: "ファイルの中身が1バイトも違いません（ファイル名だけ相違）。消しても失われるものはありません。",
    safeForBulk: true,
  },
  sameTitle: {
    label: "同タイトル・別バージョン",
    desc: "資料名は同じですが中身が違います。どちらが最新かを開いて確かめてください。",
    safeForBulk: false,
  },
  similarTitle: {
    label: "似た資料名・別バージョン（要確認）",
    desc: "資料名がよく似ていますが中身は別物です。別の施術・別の版の可能性があります。必ず開いて確認してください。",
    safeForBulk: false,
  },
};
