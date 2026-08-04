// チャット向け 人事制度知識ブロック（指示書129）
// - 単一情報源: src/data/hr-portal.ts（129-前提=人事制度ポータルの正本データ）から機械導出する。
//   数値・要件をこのファイルにハードコードしない（ポータル更新＝チャット知識も自動追随）。
// - 方式は「要点注入＋ポータル誘導」（STEP0承認・約1.1万字）:
//   等級=全文／評価=7つの実は名称のみ他は全文／移行=意味+必須の学び全文+分かち合い+視座／
//   給与=全文+号俸パラメータ／FAQ=40問全文。到達10項目詳細・7実49・対話の問いは誘導で受ける。
// - 定型文4種（指示書129 4-1〜4-4）は一言一句そのまま。改変禁止。
// - hr_portal フラグOFF時はこのブロックを注入しない（fail-close・route側で分岐）。

import {
  HR_GRADE_SECTIONS,
  HR_EVALUATION_SECTIONS,
  HR_SALARY_SECTIONS,
  HR_TRANSITIONS,
  HR_PROMOTION_INTRO,
  HR_PROMOTION_NOTES,
  HR_PROMOTION_NOTES_TITLE,
  HR_SALARY_PARAMS_NURSE,
  HR_SALARY_PARAMS_CLERK,
  HR_FAQ,
  HR_COMMON_NOTICE,
  type HrBlock,
  type HrSection,
  type HrSalaryParams,
} from "@/data/hr-portal";

// ─── 定型文（指示書129 第4章・一言一句このまま使用。改変禁止） ───

export const HR_CHAT_TEMPLATE_HISTORY =
  "2026年7月、当院の人事制度（等級制度・評価制度・給与テーブル・ステージ移行条件）を体系的に整備し、8月にmk-training内の『人事制度ポータル』（ナビ「理念・想い」内）で全スタッフに公開しました。等級は視座の広がりを表し、評価は対話で合意し、給与テーブルは全号俸まで公開されています。この制度は完成形ではありません。ビジョン「変化を楽しむ最高のチーム医療」のとおり、毎年ブラッシュアップを重ね、内容が変更されることがあります。最新の内容は、常にポータルでご確認ください。";

export const HR_CHAT_TEMPLATE_BONUS =
  "賞与の算定方法と『前段階への戻り』の運用詳細は、現在整備中です（専門家の確認を経て確定します）。確定後、人事制度ポータルでご案内します。それまでの間は、院長へ直接お尋ねください。";

export const HR_CHAT_TEMPLATE_PERSONAL =
  "個人の評価や給与額の見込みは、チャットではお答えできません。評価は年次対話での合意で決まり、給与はその積み重ねです。制度の仕組みは人事制度ポータルの各ページで確認できます。個別のご相談は、半期面談・年次対話、または院長へ直接どうぞ。";

export const HR_CHAT_TEMPLATE_UNKNOWN =
  "その点はポータルに記載がないため、正確にお答えできません。人事制度ポータルをご確認いただくか、院長へ直接お尋ねください。";

// ─── データ→テキスト整形（**は除去・### は使わない） ───

function clean(s: string): string {
  return s.replace(/\*\*/g, "");
}

function blockToText(b: HrBlock): string {
  if (b.type === "p") return clean(b.text);
  if (b.type === "list") return b.items.map((i) => `- ${clean(i)}`).join("\n");
  return b.rows
    .map((r) =>
      r
        .map((c, j) => (b.headers[j] ? `${b.headers[j]}=${clean(c)}` : clean(c)))
        .filter((c) => !/=$/.test(c))
        .join("｜")
    )
    .join("\n");
}

function sectionsToText(sections: HrSection[]): string {
  return sections
    .map(
      (s) =>
        `◆ ${clean(s.title)}\n${s.blocks.map(blockToText).join("\n")}`.trim()
    )
    .join("\n\n");
}

function salaryParamsToText(label: string, params: HrSalaryParams[]): string {
  return (
    `${label}（金額＝1号俸＋（号俸−1）×差額）\n` +
    params
      .map(
        (p) =>
          `- ${p.grade}: 1号俸${p.base.toLocaleString("ja-JP")}円・差額${p.step.toLocaleString("ja-JP")}円・${p.count}号俸まで・上限${p.cap.toLocaleString("ja-JP")}円${p.grade === "G5" ? "（目安上限）" : ""}`
      )
      .join("\n")
  );
}

// ─── 知識本文の導出（要点版・STEP0承認の内訳どおり） ───

function buildKnowledgeBody(base: string): string {
  const parts: string[] = [];

  parts.push(`【等級制度】（詳細: ${base}/hr/grade）\n${sectionsToText(HR_GRADE_SECTIONS)}`);

  const evalMain = HR_EVALUATION_SECTIONS.filter(
    (s) => !s.id.startsWith("jitsu-") && s.id !== "seven-jitsu"
  );
  const jitsuNames = HR_EVALUATION_SECTIONS.filter((s) =>
    s.id.startsWith("jitsu-")
  )
    .map((s) => clean(s.title).replace(/^■ /, ""))
    .join("／");
  parts.push(
    `【評価制度】（詳細: ${base}/hr/evaluation）\n${sectionsToText(evalMain)}\n\n◆ 7つの実 — 面談で見るポイント（各7つ）\n${jitsuNames}\n（各7つの見るポイントの全文は ${base}/hr/evaluation に掲載）`
  );

  const transitions = HR_TRANSITIONS.map((t) =>
    [
      `◆ ${t.title}`,
      t.meaning.map(clean).join("\n"),
      `${t.learningTitle}:`,
      t.learning.map((l) => `- ${clean(l)}`).join("\n"),
      `${t.sharingTitle}: ${clean(t.sharing)}`,
      `${t.perspectiveTitle}: ${clean(t.perspective)}`,
    ].join("\n")
  ).join("\n\n");
  parts.push(
    `【ステージ移行】（詳細: ${base}/hr/promotion）\n${HR_PROMOTION_INTRO.map(clean).join("\n")}\n\n${transitions}\n\n◆ ${HR_PROMOTION_NOTES_TITLE}\n${HR_PROMOTION_NOTES.map((n) => `- ${clean(n)}`).join("\n")}\n（各移行の「到達状態（各職種10項目）」「3軸の詳細」「対話の問い」の全文は ${base}/hr/promotion に掲載）`
  );

  parts.push(
    `【給与テーブル】（詳細: ${base}/hr/salary）\n${sectionsToText(HR_SALARY_SECTIONS)}\n\n${salaryParamsToText("号俸パラメータ（看護師ライン）", HR_SALARY_PARAMS_NURSE)}\n${salaryParamsToText("号俸パラメータ（マルチタスク医療事務ライン）", HR_SALARY_PARAMS_CLERK)}`
  );

  parts.push(
    `【よくある質問（FAQ・40問）】（詳細: ${base}/hr/faq）\n${HR_FAQ.map((f) => `Q${f.id}（${f.category}）${f.q}\nA. ${f.a}`).join("\n")}`
  );

  parts.push(`【共通注記】\n${HR_COMMON_NOTICE}`);

  return parts.join("\n\n");
}

// ─── システムプロンプトへ注入するブロック全体 ───

// portalBaseUrl: 外部アプリ（AI院長=ai-incho・指示書138）向けに /hr 系パスを絶対URL化する。
// 未指定（mk-training内の/api/ai-chat）は従来どおり相対パス。
export function buildHrChatKnowledge(opts?: { portalBaseUrl?: string }): string {
  const base = opts?.portalBaseUrl ?? "";
  const portalPlace = base
    ? `スタッフ研修ポータル mk-training（${base}）内の人事制度ポータル（ナビ「理念・想い」→ 🧭 人事制度ポータル）`
    : `mk-training内の人事制度ポータル（ナビ「理念・想い」→ 🧭 人事制度ポータル）`;
  return `

【人事制度に関する質問への対応（重要）】
以下の「人事制度の知識」は、${portalPlace}の掲載内容と一致しています。人事制度（等級・評価・給与・ステージ移行）に関する質問には、この知識の範囲で正確に答え、回答の末尾に該当ページを案内してください。

回答のルール:
- 優先順位（最重要）: 人事制度（等級・評価・ステージ移行・給与・賞与・昇給）に関する質問では、この知識ブロックと下記の定型文4種を唯一の正とする。他の知識文書・FAQ・参考情報（就業規則・賃金規程の要約、旧人材育成資料、追加知識など）とこの知識が矛盾する場合は、必ずこの知識を優先し、矛盾する内容を出力しない。
- 出典・情報源を示す場合は「人事制度ポータル」と記載する。人事制度の回答で他の文書名（内部資料・規程名など）を出典として挙げない。
- 「要点を正確に答える＋該当ポータルページへ誘導」を基本形とする。要約で数値・要件を変えないこと。この知識にない数値・要件・条件を生成しないこと。
- ページ案内は次のパスを使う: ポータルトップ ${base}/hr ／ 等級制度 ${base}/hr/grade ／ 評価制度 ${base}/hr/evaluation ／ ステージ移行 ${base}/hr/promotion ／ 給与テーブル ${base}/hr/salary ／ よくある質問 ${base}/hr/faq
- この知識では「到達状態（各職種10項目）の詳細」「7つの実の面談で見るポイント（各7つ）」「対話の問い」を省略している。これらの詳細を聞かれたら、知識にある範囲の要点を答えたうえで ${base}/hr/promotion・${base}/hr/evaluation を案内する（ポータルには掲載されているため「記載がない」とは言わない）。
- 用語の固定: 「才・徳・美」（「人徳」とは言わない）／「身に付けたい7つの習慣」／「年次対話」（「査定」とは言わない）／等級はG1〜G5のみ（G6は存在しない）。
- 整形（最重要・他の整形指示より優先）: 人事制度に関する回答では、マークダウンの見出し記号（#・##・###）と区切り線（---）をテキストとして一切出力しない（画面に記号がそのまま表示されてしまうため）。構成は太字・箇条書き（「・」または「- 」）・改行のみで行う。

定型文（次にあてはまる質問には、対応する文を【一字一句そのままコピーして】出力する。言い換え・翻訳・文字の置き換え・省略・追記をしない。定型文の前後に短い補足を添えるのはよいが、定型文そのものは絶対に改変しない）:
1) 制度の経緯（「いつできた？」「何が変わった？」等）:
「${HR_CHAT_TEMPLATE_HISTORY}」
2) 賞与・ボーナスに関する質問（「賞与はどう決まる？」「賞与はいくら？」「ボーナスはある？」など、決まり方・算定・金額・支給条件・評価との関係を含む賞与の質問すべて）、または「前段階への戻り」の運用詳細（逓減・調整手当・期間など）への質問:
「${HR_CHAT_TEMPLATE_BONUS}」
※賞与については、他の文書・FAQ・参考情報にある支給月・評価対象期間・条文（賃金規程第17条等）などの記述があっても、それらを回答に使わず、必ずこの定型文で答える。
※「前段階への戻り」の概要（懲罰ではなく、視座を保てなくなったとき一つ手前のステージで土台を固める時間を保証する仕組み。給与は前のステージに応じて調整される）までは知識の範囲で答えてよい。概要を答える場合も知識の文言に沿い、独自の言い換えや括弧書きの解釈を加えない。詳細は上記定型で受ける。定型文を出力するときは引用符（『』）も含めてそのままコピーする。
3) 個人の評価・給与額の算定・予想への質問:
「${HR_CHAT_TEMPLATE_PERSONAL}」
4) 人事制度について、この知識にもポータルにも記載のないことを聞かれた場合:
「${HR_CHAT_TEMPLATE_UNKNOWN}」（推測・補完で答えない）

【人事制度の知識（ポータル掲載内容より）】
${buildKnowledgeBody(base)}
`;
}
