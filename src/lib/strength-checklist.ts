// 才・徳・美チェックリスト（指示書151）
// 文言は指示書151の150項目を**一言一句そのまま**収載（創作・改変禁止）。
//
// 【重要】保存はここで定義した id（例 "sai-01"）で行い、表示のたびに文言を引く。
// 文言を直しても過去のチェックが外れないようにするため、**id は絶対に振り直さない**。
// 項目を廃止する場合も id は欠番のまま残し、再利用しないこと。
//
// 150（AI取り込み）との連携について: 現時点では未連携。
// 将来、AIの提案文からチェック項目を推定して自動でチェックを付けたくなった場合は、
// この LABEL を突合辞書として使い、提案 → 候補id の対応を出す関数をここに足す想定
// （その場合も「AIが直接保存しない・院長の承認後」の原則は150と同じく守ること）。

export type StrengthCategoryKey = "sai" | "toku" | "bi";

export type StrengthItem = { id: string; label: string };

export type StrengthCategory = {
  key: StrengthCategoryKey;
  /** タブに出す短い名前 */
  short: string;
  /** 見出しに出す説明つきの名前 */
  title: string;
  items: readonly StrengthItem[];
};


const SAI_ITEMS: readonly StrengthItem[] = [
  { id: "sai-01", label: "段取りが早い" },
  { id: "sai-02", label: "説明がわかりやすい" },
  { id: "sai-03", label: "覚えるのが早い" },
  { id: "sai-04", label: "手技が丁寧で正確" },
  { id: "sai-05", label: "ミスが少ない" },
  { id: "sai-06", label: "優先順位づけがうまい" },
  { id: "sai-07", label: "マルチタスクが得意" },
  { id: "sai-08", label: "PC・ツールの習得が早い" },
  { id: "sai-09", label: "AIやアプリを使いこなす" },
  { id: "sai-10", label: "文章を書くのがうまい" },
  { id: "sai-11", label: "資料づくりが得意" },
  { id: "sai-12", label: "数字に強い" },
  { id: "sai-13", label: "レセプト・算定に詳しい" },
  { id: "sai-14", label: "商品知識が豊富" },
  { id: "sai-15", label: "施術知識が深い" },
  { id: "sai-16", label: "観察力が鋭い" },
  { id: "sai-17", label: "小さな変化に気づく" },
  { id: "sai-18", label: "問題の原因を見つけるのが早い" },
  { id: "sai-19", label: "改善案を思いつく" },
  { id: "sai-20", label: "新しい方法を試すのが好き" },
  { id: "sai-21", label: "計画を立てるのが得意" },
  { id: "sai-22", label: "締切を必ず守る" },
  { id: "sai-23", label: "仕事が速い" },
  { id: "sai-24", label: "正確さと速さを両立できる" },
  { id: "sai-25", label: "急な変更に強い" },
  { id: "sai-26", label: "トラブル対応が冷静" },
  { id: "sai-27", label: "判断が的確" },
  { id: "sai-28", label: "記憶力が良い" },
  { id: "sai-29", label: "手先が器用" },
  { id: "sai-30", label: "写真・画像撮影がうまい" },
  { id: "sai-31", label: "SNS発信が得意" },
  { id: "sai-32", label: "デザインセンスがある" },
  { id: "sai-33", label: "教えるのがうまい" },
  { id: "sai-34", label: "マニュアル化が得意" },
  { id: "sai-35", label: "情報整理がうまい" },
  { id: "sai-36", label: "在庫・物品管理が正確" },
  { id: "sai-37", label: "電話対応が的確" },
  { id: "sai-38", label: "カウンセリングで要望を引き出せる" },
  { id: "sai-39", label: "提案力がある" },
  { id: "sai-40", label: "交渉・調整がうまい" },
  { id: "sai-41", label: "会議の進行がうまい" },
  { id: "sai-42", label: "質問の仕方がうまい" },
  { id: "sai-43", label: "学んだことをすぐ実践する" },
  { id: "sai-44", label: "振り返りの習慣がある" },
  { id: "sai-45", label: "資格取得に積極的" },
  { id: "sai-46", label: "語学ができる" },
  { id: "sai-47", label: "機器の扱いに強い" },
  { id: "sai-48", label: "感染対策の知識が確か" },
  { id: "sai-49", label: "緊急時の初動が早い" },
  { id: "sai-50", label: "複数部署の業務をこなせる" },
];

const TOKU_ITEMS: readonly StrengthItem[] = [
  { id: "toku-01", label: "素直に人の話を聴ける" },
  { id: "toku-02", label: "謙虚である" },
  { id: "toku-03", label: "感謝を言葉にできる" },
  { id: "toku-04", label: "思いやりがある" },
  { id: "toku-05", label: "約束を守る" },
  { id: "toku-06", label: "言行一致している" },
  { id: "toku-07", label: "誰にでも公平" },
  { id: "toku-08", label: "陰口を言わない" },
  { id: "toku-09", label: "仲間の成功を喜べる" },
  { id: "toku-10", label: "後輩に自然に声をかける" },
  { id: "toku-11", label: "困っている人を放っておけない" },
  { id: "toku-12", label: "頼まれごとを快く引き受ける" },
  { id: "toku-13", label: "自分から手伝いを申し出る" },
  { id: "toku-14", label: "失敗を認めて謝れる" },
  { id: "toku-15", label: "他責にしない" },
  { id: "toku-16", label: "感情が安定している" },
  { id: "toku-17", label: "忙しくても態度が変わらない" },
  { id: "toku-18", label: "誰に対しても丁寧" },
  { id: "toku-19", label: "聞き役に回れる" },
  { id: "toku-20", label: "相手の立場で考えられる" },
  { id: "toku-21", label: "秘密を守る" },
  { id: "toku-22", label: "正直である" },
  { id: "toku-23", label: "損得で動かない" },
  { id: "toku-24", label: "コツコツ続けられる" },
  { id: "toku-25", label: "最後までやり抜く" },
  { id: "toku-26", label: "目立たない仕事も丁寧" },
  { id: "toku-27", label: "縁の下の力持ち" },
  { id: "toku-28", label: "チームの和を大切にする" },
  { id: "toku-29", label: "意見の違いを尊重できる" },
  { id: "toku-30", label: "批判ではなく提案で伝える" },
  { id: "toku-31", label: "励ますのがうまい" },
  { id: "toku-32", label: "いいところを見つけて褒める" },
  { id: "toku-33", label: "新人に安心感を与える" },
  { id: "toku-34", label: "患者さんに寄り添える" },
  { id: "toku-35", label: "クレームにも誠実に向き合う" },
  { id: "toku-36", label: "感情的にならず話し合える" },
  { id: "toku-37", label: "ルールを守る" },
  { id: "toku-38", label: "時間を守る" },
  { id: "toku-39", label: "自分の機嫌を自分で取れる" },
  { id: "toku-40", label: "プラス思考" },
  { id: "toku-41", label: "学ぶ姿勢を持ち続けている" },
  { id: "toku-42", label: "フィードバックを素直に受け取る" },
  { id: "toku-43", label: "人の成長を信じられる" },
  { id: "toku-44", label: "分かち合いを実践している" },
  { id: "toku-45", label: "報連相を怠らない" },
  { id: "toku-46", label: "責任感が強い" },
  { id: "toku-47", label: "当事者意識がある" },
  { id: "toku-48", label: "感謝されなくても行動できる" },
  { id: "toku-49", label: "役割を超えてチームのために動ける" },
  { id: "toku-50", label: "信頼されている" },
];

const BI_ITEMS: readonly StrengthItem[] = [
  { id: "bi-01", label: "笑顔が絶えない" },
  { id: "bi-02", label: "あいさつが気持ちいい" },
  { id: "bi-03", label: "言葉づかいが美しい" },
  { id: "bi-04", label: "姿勢が良い" },
  { id: "bi-05", label: "立ち居振る舞いが落ち着いている" },
  { id: "bi-06", label: "身だしなみが清潔" },
  { id: "bi-07", label: "髪・爪の手入れが行き届いている" },
  { id: "bi-08", label: "制服をきれいに着こなす" },
  { id: "bi-09", label: "声のトーンが心地よい" },
  { id: "bi-10", label: "話すスピードが聞き取りやすい" },
  { id: "bi-11", label: "所作が丁寧" },
  { id: "bi-12", label: "物の受け渡しが丁寧" },
  { id: "bi-13", label: "ドアの開け閉めが静か" },
  { id: "bi-14", label: "歩き方が美しい" },
  { id: "bi-15", label: "デスク周りが整っている" },
  { id: "bi-16", label: "共有スペースを美しく保つ" },
  { id: "bi-17", label: "片付けが行き届いている" },
  { id: "bi-18", label: "整理整頓が習慣になっている" },
  { id: "bi-19", label: "掃除を進んでやる" },
  { id: "bi-20", label: "物を大切に扱う" },
  { id: "bi-21", label: "書く字がきれい" },
  { id: "bi-22", label: "時間の使い方にメリハリがある" },
  { id: "bi-23", label: "食事・健康に気を配っている" },
  { id: "bi-24", label: "体調管理ができている" },
  { id: "bi-25", label: "生活リズムが整っている" },
  { id: "bi-26", label: "運動の習慣がある" },
  { id: "bi-27", label: "肌のお手入れを実践している" },
  { id: "bi-28", label: "メイクが上品" },
  { id: "bi-29", label: "香りへの配慮がある" },
  { id: "bi-30", label: "表情が明るい" },
  { id: "bi-31", label: "目を見て話す" },
  { id: "bi-32", label: "お辞儀が美しい" },
  { id: "bi-33", label: "電話の切り方まで丁寧" },
  { id: "bi-34", label: "患者さんの前での私語を慎む" },
  { id: "bi-35", label: "バックヤードでも品位を保つ" },
  { id: "bi-36", label: "SNSでの発信が品位ある" },
  { id: "bi-37", label: "感謝のメモや手紙を書く" },
  { id: "bi-38", label: "季節感を大切にする" },
  { id: "bi-39", label: "花や飾りに気を配る" },
  { id: "bi-40", label: "掲示物を美しく整える" },
  { id: "bi-41", label: "ゴミが落ちていたら拾う" },
  { id: "bi-42", label: "水回りをきれいに使う" },
  { id: "bi-43", label: "物音への配慮がある" },
  { id: "bi-44", label: "待合の空気を和ませる" },
  { id: "bi-45", label: "忙しい時ほど所作が乱れない" },
  { id: "bi-46", label: "立ち姿で安心感を与える" },
  { id: "bi-47", label: "心の余裕を感じさせる" },
  { id: "bi-48", label: "上品なユーモアがある" },
  { id: "bi-49", label: "生き方に一貫性がある" },
  { id: "bi-50", label: "憧れられる存在である" },
];

export const STRENGTH_CATEGORIES: readonly StrengthCategory[] = [
  { key: "sai", short: "才", title: "才（物事を成し遂げる能力・仕事の力）", items: SAI_ITEMS },
  { key: "toku", short: "徳", title: "徳（人柄・信頼される関わり方）", items: TOKU_ITEMS },
  { key: "bi", short: "美", title: "美（所作・佇まい・美しく生きる姿勢）", items: BI_ITEMS },
];

/** id → 項目（表示時に文言を引くための索引） */
export const STRENGTH_ITEM_BY_ID: ReadonlyMap<string, StrengthItem & { category: StrengthCategoryKey }> =
  new Map(
    STRENGTH_CATEGORIES.flatMap((c) =>
      c.items.map((it) => [it.id, { ...it, category: c.key }] as const)
    )
  );

/** 保存値の正規化: 実在するidだけを、定義順に重複なく残す */
export function normalizeStrengthChecks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(
    raw.filter((v): v is string => typeof v === "string" && STRENGTH_ITEM_BY_ID.has(v))
  );
  const ordered: string[] = [];
  for (const c of STRENGTH_CATEGORIES) {
    for (const it of c.items) if (set.has(it.id)) ordered.push(it.id);
  }
  return ordered;
}

/** カテゴリごとのチェック数 */
export function countByCategory(
  checks: string[]
): Record<StrengthCategoryKey, number> {
  const out: Record<StrengthCategoryKey, number> = { sai: 0, toku: 0, bi: 0 };
  for (const id of checks) {
    const it = STRENGTH_ITEM_BY_ID.get(id);
    if (it) out[it.category] += 1;
  }
  return out;
}
