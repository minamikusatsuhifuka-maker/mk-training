// 1on1の書き起こしの取り込み（指示書221）— 純関数・文言・AIへの指示文
//
// 【何をするか】1on1の音声を書き起こした文書を1回だけAIに渡し、
//   「まとめ」と「記録欄の下書き」を作る。**書き起こしの原文はどこにも残さない**（221 §5）。
//
// 【残さない（221 §5）】原文はAIに送るときに1回使うだけ。DB・ファイル・サーバーのログ・
//   ブラウザの保存（sessionStorage / localStorage）に入れない。ログに出すのは文字数・時間・結果だけ。
//
// 【AIがしないこと（221 §3-3）】評価・人物像の断定・ラベル付け／本人の目標・フィードバック・
//   7つの実・現在地への書き込み／健康・家族・お金などの個人的な事情／患者さんや他のスタッフの名前。
//   除いたときは、確認画面に注意の一文だけを出す（中身は出さない）。
//
// 依存は lib/rwdepc.ts（RWDEPCの表の正本・223 §1-1）だけ。AIへの指示文の欄の名前も表から取る。

import { RWDEPC_TABLE } from "./rwdepc";

/** 貼り付け・ファイルから取り込める上限（221 §2-2。1on1は10〜15分の想定） */
export const TRANSCRIPT_MAX_CHARS = 40000;

/** 1人あたり1日の回数の上限（221 §6） */
export const TRANSCRIPT_DAILY_LIMIT = 30;

/** 取り込めるファイル（221 §2-2） */
export const TRANSCRIPT_ACCEPT = ".txt,.md,.docx,.pdf";
export const TRANSCRIPT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** 画面の入口の名前（1on1ノートと成長記録の「1on1」タブで同じ） */
export const TRANSCRIPT_ENTRY_LABEL = "📄 書き起こしから記録する";

/** 貼り付け欄の上に常時出す注意（221 §2-2・文言を変えないこと） */
export const TRANSCRIPT_NOTICE =
  "患者さんの氏名など、個人が分かる言葉が含まれていないか確かめてから取り込んでください。";

/** 取り扱いに注意が必要な話があったときに出す一文（中身は出さない・221 §3-3） */
export const TRANSCRIPT_FLAGGED_NOTICE =
  "取り扱いに注意が必要な話が含まれていました（まとめには入れていません）。";

/** 原文を残さないことの説明（確認画面に出す） */
export const TRANSCRIPT_NO_KEEP_NOTICE =
  "書き起こしの原文は保存しません。残るのは、まとめと記録欄だけです。";

/** AIの下書きであることの印（直すと消える・221 §2-4） */
export const TRANSCRIPT_DRAFT_MARK = "AIの下書き";

/** 本人の画面でまとめに添える一文（221 §4） */
export const TRANSCRIPT_SUMMARY_NOTE = "AIで整理し、記録者が確かめた内容です。";

// ─── 同意の印（221 §1） ───

/** 本人の画面に出す文（○月○日が入る・文言を変えないこと） */
export function consentNoticeForOwner(on: string): string {
  const d = /^\d{4}-(\d{2})-(\d{2})$/.exec(on || "");
  const when = d ? `${Number(d[1])}月${Number(d[2])}日` : "";
  return on
    ? `1on1の録音と書き起こし：同意あり（${when}）。やめたいときは院長に伝えてください。`
    : "1on1の録音と書き起こし：同意はまだありません。";
}

/** 同意の印の行id（スタッフごとに1行） */
export function transcriptConsentId(userId: string): string {
  return `tcons-${userId}`;
}

/** 1日の回数の行id（人ごと・日ごとに1行） */
export function transcriptQuotaId(userId: string, ymd: string): string {
  return `tq-${userId}-${ymd.replaceAll("-", "")}`;
}

export type TranscriptConsent = { userId: string; on: string; by: string; updatedAt: string };

export function normalizeConsent(raw: unknown): TranscriptConsent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const userId = typeof o.userId === "string" ? o.userId : "";
  const on = typeof o.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.on) ? o.on : "";
  if (!userId || !on) return null;
  return {
    userId,
    on,
    by: typeof o.by === "string" ? o.by.slice(0, 200) : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

// ─── まとめ（221 §3-1） ───

export type TranscriptSummary = {
  /** 話の流れ（3〜5行） */
  flow: string;
  /** 本人の言葉（原文のまま1〜3つ） */
  quotes: string[];
  /** 決めたこと（約束・次の一歩） */
  decided: string;
  /** 院長（記録者）がすること */
  support: string;
  /** AIで作った日時（記録に残す） */
  at: string;
};

export function emptyTranscriptSummary(): TranscriptSummary {
  return { flow: "", quotes: [], decided: "", support: "", at: "" };
}

const TEXT_MAX = 4000;

function str(v: unknown, max = TEXT_MAX): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeTranscriptSummary(raw: unknown): TranscriptSummary {
  const base = emptyTranscriptSummary();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    flow: str(o.flow),
    quotes: Array.isArray(o.quotes)
      ? o.quotes.filter((q): q is string => typeof q === "string").slice(0, 3).map((q) => q.slice(0, 500))
      : [],
    decided: str(o.decided),
    support: str(o.support),
    at: str(o.at, 40),
  };
}

export function isEmptySummary(s: TranscriptSummary): boolean {
  return !s.flow.trim() && s.quotes.length === 0 && !s.decided.trim() && !s.support.trim();
}

/** まとめの見出し（画面・印刷で同じ言い方を使う） */
export const SUMMARY_LABELS = {
  flow: "話の流れ",
  quotes: "本人の言葉",
  decided: "決めたこと",
  support: "記録者がすること",
} as const;

// ─── 記録欄の下書き（221 §3-2） ───

export type TranscriptDraft = {
  mode: "quick" | "rwdepc";
  sections: { theme: string; kizuki: string; nextStep: string };
  /** 223: R（人間関係の構築）を先頭に足した */
  rwdepc: { r: string; w: string; d: string; e: string; p: string; c: string };
};

export function emptyTranscriptDraft(mode: "quick" | "rwdepc"): TranscriptDraft {
  return {
    mode,
    sections: { theme: "", kizuki: "", nextStep: "" },
    rwdepc: { r: "", w: "", d: "", e: "", p: "", c: "" },
  };
}

export function normalizeTranscriptDraft(raw: unknown, mode: "quick" | "rwdepc"): TranscriptDraft {
  const base = emptyTranscriptDraft(mode);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const sec = (o.sections ?? {}) as Record<string, unknown>;
  const rw = (o.rwdepc ?? {}) as Record<string, unknown>;
  return {
    mode,
    sections: {
      theme: str(sec.theme),
      kizuki: str(sec.kizuki),
      nextStep: str(sec.nextStep),
    },
    rwdepc: {
      r: str(rw.r),
      w: str(rw.w),
      d: str(rw.d),
      e: str(rw.e),
      p: str(rw.p),
      c: str(rw.c),
    },
  };
}

export type TranscriptResult = {
  summary: TranscriptSummary;
  draft: TranscriptDraft;
  /** 取り扱いに注意が必要な話を除いたか（中身は返さない・221 §3-3） */
  flagged: boolean;
};

/** AIの応答（JSON）を受け取る。壊れていれば null */
export function parseTranscriptJson(text: string, mode: "quick" | "rwdepc"): TranscriptResult | null {
  const body = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  return {
    summary: normalizeTranscriptSummary(o.summary),
    draft: normalizeTranscriptDraft(o.draft, mode),
    flagged: o.flagged === true,
  };
}

// ─── AIへの指示文（221 §3。報告書に全文を載せる） ───

/**
 * システム側の指示。**ここが唯一の正本**（画面やルートに書き写さない）。
 * 文中の決まりは 221 §3-1〜§3-3 と、既存の線引き（152/153/179 の
 * 「評価しない」「E欄は本人の言葉だけ」）から取っている。
 */
export const TRANSCRIPT_SYSTEM_PROMPT = [
  "あなたは、クリニックの1on1（上司と部下の対話）の書き起こしを整理する補助者です。",
  "書き起こしを読み、(1) まとめ と (2) 記録欄の下書き を作ります。",
  "",
  "【絶対に守ること】",
  "1. 書き起こしに出てこないことは書かない。分からない欄は空文字にする（推測で埋めない）。",
  "2. 評価・人物像の断定・性格の判定・ラベル付けをしない（「意欲が高い」「消極的」などと書かない）。",
  "3. E（自己評価）には、本人が自分について言った言葉だけを入れる。記録者（上司）の評価は入れない。本人の言葉がなければ空にする。",
  "4. 健康・家族・お金など個人的な事情は、まとめにも記録欄にも書かない。触れる必要があるときは「個人的な事情についての話があった」とだけ書く。",
  "5. 患者さんや他のスタッフの名前は書かない。「患者さん」「先輩」などの一般名で書く。",
  "6. 4と5に当たる内容を除いたときは、flagged を true にする（何を除いたかは書かない）。",
  "7. 本人の目標（目標タブ）・フィードバック・7つの実・現在地・等級の**記録には書き込まない**（それらの下書きは作らない）。これは1on1の記録欄を空にする理由にはならない。"
    + "本人が語ったことは、1on1の記録欄（R〜C）にそのまま書く。本人の言葉に等級の名前（G2など）や年数（3年後など）が出てきても、言い換えずそのまま書く。",
  "",
  "【まとめ（summary）】",
  "- flow: 話の流れを3〜5行。箇条書きではなく、行ごとに1文。",
  "- quotes: 本人の発言のうち印象に残ったものを**原文のまま**1〜3つ。言い換えない。",
  "- decided: 決めたこと（約束・次の一歩）。無ければ空。",
  "- support: 記録者が引き受けた支援（本人が求め、記録者が応じたもの）。無ければ空。",
  "",
  "【記録欄の下書き（draft）】",
  "- クイックメモ（quick）のとき: sections.theme（話したテーマ）／sections.kizuki（気づき・学び）／sections.nextStep（次の一歩）。",
  `- RWDEPC のとき: 次の6つの欄を埋める（${RWDEPC_TABLE.map((t) => `${t.mark}=${t.en}=${t.ja}`).join("／")}）。`,
  "  - rwdepc.r: 関係づくりのやりとり。記録者が伝えたねぎらい・感謝、本人が話してくれた近況やうれしかったこと。記録者による本人の仕事ぶりの評価は入れない。",
  "  - rwdepc.w: 本人が語った願望（なりたい姿・求めていること）を、本人の言葉に沿って書く。記録者の期待は入れない。本人が願望を語っていれば、必ず書く（空にしない）。",
  "  - rwdepc.d: 本人が今していること。rwdepc.p: 決めた計画。rwdepc.c: 次回までの約束。",
  "  - rwdepc.e: 本人が自分について言った言葉だけ（上の3のとおり）。",
  "- 選ばれていない形式の欄は、すべて空文字にする。",
  "",
  "【出力】次のJSONだけを返す。コードフェンス・前後の説明は付けない。",
  '{"summary":{"flow":"","quotes":[],"decided":"","support":""},"draft":{"sections":{"theme":"","kizuki":"","nextStep":""},"rwdepc":{"r":"","w":"","d":"","e":"","p":"","c":""}},"flagged":false}',
].join("\n");

/** 書き起こしに添える指示（形式を伝える） */
export function transcriptUserPrompt(mode: "quick" | "rwdepc"): string {
  const form =
    mode === "rwdepc"
      ? "記録の形式は RWDEPC です。draft.rwdepc を埋め、draft.sections は空にしてください。"
      : "記録の形式は クイックメモ です。draft.sections を埋め、draft.rwdepc は空にしてください。";
  return `${form}\n次は1on1の書き起こしです。これだけを材料にしてください。\n\n`;
}

// ─── 実施日の初期値（223 §4） ───

/**
 * 取り込み画面の実施日の初期値。
 * ① 今日に1on1の予約があれば今日 → ② なければ今日より前でいちばん近い予約日 → ③ それもなければ今日。
 * **先の日付は初期値にしない**（取り込みは1on1のあとに行うため）。選ぶことはできる。
 */
export function transcriptDefaultHeldOn(
  scheduleDates: readonly string[],
  today: string,
  /** 画面で既に選ばれていた日（先の日付なら使わない） */
  preferred?: string
): string {
  const ymd = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  const base = ymd(today);
  const pref = ymd(preferred);
  if (pref && (!base || pref <= base)) return pref;
  if (!base) return "";
  // 今日の予約があれば今日（＝今日以前でいちばん新しい予約日）
  const past = scheduleDates.map(ymd).filter((d) => d && d <= base).sort();
  return past[past.length - 1] || base;
}

// ─── 検証用の架空の書き起こし（221 §7） ───

/**
 * 検証用アカウントのときだけ画面に出す見本。
 * **わざと**患者さんの名前・健康の話・家族の話を含めてある（除かれることを確かめるため）。
 * 223: R（関係づくりのやりとり）と、等級の名前を含む願望も入れてある
 * （R欄が埋まること・W欄が空にならないことを確かめるため）。
 */
export const SAMPLE_TRANSCRIPT = [
  "（検証用の架空の書き起こしです。実在の人物とは関係ありません）",
  "",
  "院長: 今日はありがとう。事前アンケートを早めに出してくれて助かりました。",
  "花子: よかったです。ありがとうございます。",
  "院長: この1か月どうでしたか。",
  "花子: 処置の準備は一人でできるようになりました。チェック表を作ってから、準備の抜けがなくなって自信がつきました。",
  "院長: それは大きな前進ですね。よくがんばりました。",
  "花子: 先輩から「準備が丁寧になった」と言ってもらえたのが、うれしかったです。",
  "院長: いいですね。うまくいった場面は。",
  "花子: 先週、山田さん（患者さん）の処置で、先輩に聞かずに準備を終えられました。",
  "院長: 困っていることは。",
  "花子: 光線治療の操作がまだ不安です。自分ではまだ半人前だと思っています。",
  "院長: なるほど。どうなりたいですか。",
  "花子: 半年後には、光線治療も一人で任せてもらえるようになりたいです。",
  "花子: 3年後には、G2として、外来を一人で回せるようになっていたいです。患者さんに「この人なら安心」って思ってもらえる看護師になりたいです。",
  "院長: そのために何をしますか。",
  "花子: 先輩の操作を週1回見学して、手順を自分の言葉でまとめます。今月中にまとめます。",
  "院長: わかりました。見学の時間はこちらで調整します。火曜の午後に枠を作りますね。",
  "花子: ありがとうございます。あと、最近、母の通院の付き添いで少し疲れていて、睡眠が浅い日があります。",
  "院長: それは大変ですね。無理のない範囲で。シフトの相談はいつでもしてください。",
  "花子: はい。ありがとうございます。",
  "院長: では、次回までに手順のまとめをお願いします。",
  "花子: はい、やってみます。",
].join("\n");
