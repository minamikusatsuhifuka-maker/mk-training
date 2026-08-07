// 7つの実チェック（指示書152）— 1on1ノートで使う140項目
// 文言は指示書152の140項目を**一言一句そのまま**収載（創作・改変禁止）。
//
// 【重要】保存はここで定義した id（例 "jikko-01"）で行い、表示のたびに文言を引く。
// 文言を直しても過去の1on1のチェックが変わらないよう、**id は絶対に振り直さない**。
// 項目を廃止する場合も id は欠番のまま残し、再利用しないこと。
//
// 【評価原則】合計スコア・ランク判定・他メンバーとの比較は作らない（指示書152-6）。
// 数を出すのはグループごとの個数バッジまで。総合点や順位に相当するものを足さないこと。

/** セクション冒頭に常時表示する一文（指示書152-6・文言を変えないこと） */
export const JITSU_NOTICE =
  "チェックの数や点数で評価は決まりません。対話の材料として、実（じつ）として現れたことを一緒に確認するためのものです。";

export type JitsuGroupKey =
  | "jikko"
  | "jisseki"
  | "jitsuryoku"
  | "jitsugen"
  | "jujitsu"
  | "seijitsu"
  | "ketsujitsu";

export type JitsuItem = { id: string; label: string };

export type JitsuGroup = {
  key: JitsuGroupKey;
  /** 見出しの短い名前（例「実行」） */
  short: string;
  /** 補足つきの見出し（例「実行（決めたことをやりきる）」） */
  title: string;
  items: readonly JitsuItem[];
};


const JIKKO_ITEMS: readonly JitsuItem[] = [
  { id: "jikko-01", label: "決めた期日を守ってやり切った" },
  { id: "jikko-02", label: "朝礼で宣言したことを実行した" },
  { id: "jikko-03", label: "面談で決めた行動を継続した" },
  { id: "jikko-04", label: "後回しにせず当日中に着手した" },
  { id: "jikko-05", label: "決めた勉強会準備を完遂した" },
  { id: "jikko-06", label: "苦手な業務から逃げずに取り組んだ" },
  { id: "jikko-07", label: "中断があっても再開してやり切った" },
  { id: "jikko-08", label: "忙しい日でも決めたルーティンを崩さなかった" },
  { id: "jikko-09", label: "頼まれた仕事を最後まで終えた" },
  { id: "jikko-10", label: "自分で立てた目標に週次で取り組んだ" },
  { id: "jikko-11", label: "改善提案を実行に移した" },
  { id: "jikko-12", label: "研修で学んだことを翌日から実践した" },
  { id: "jikko-13", label: "割り当てられた役割を期限内に果たした" },
  { id: "jikko-14", label: "やりかけの仕事を残さず完了させた" },
  { id: "jikko-15", label: "決めた練習を回数どおり行った" },
  { id: "jikko-16", label: "気が進まない調整業務もやり切った" },
  { id: "jikko-17", label: "一度失敗した手順に再挑戦して完遂した" },
  { id: "jikko-18", label: "優先度の高い仕事から手を付けた" },
  { id: "jikko-19", label: "締切前倒しで仕上げた" },
  { id: "jikko-20", label: "「やります」と言ったことを有言実行した" },
];

const JISSEKI_ITEMS: readonly JitsuItem[] = [
  { id: "jisseki-01", label: "担当業務の件数・処理量が増えた" },
  { id: "jisseki-02", label: "ミス・差し戻しが減った" },
  { id: "jisseki-03", label: "患者さんからお褒めの言葉をいただいた" },
  { id: "jisseki-04", label: "指名・リピートにつながった" },
  { id: "jisseki-05", label: "案内が成約につながった" },
  { id: "jisseki-06", label: "業務の所要時間を短縮できた" },
  { id: "jisseki-07", label: "在庫ロス・期限切れを減らした" },
  { id: "jisseki-08", label: "レセプト返戻を減らした" },
  { id: "jisseki-09", label: "予約枠の稼働を改善した" },
  { id: "jisseki-10", label: "マニュアルを完成させ運用に載せた" },
  { id: "jisseki-11", label: "勉強会・朝礼で発表を行った" },
  { id: "jisseki-12", label: "新人の独り立ちに貢献した" },
  { id: "jisseki-13", label: "SNS・発信物が反響を得た" },
  { id: "jisseki-14", label: "改善提案が採用され定着した" },
  { id: "jisseki-15", label: "クレームを信頼回復につなげた" },
  { id: "jisseki-16", label: "検定・資格に合格した" },
  { id: "jisseki-17", label: "数字で成果を報告できた" },
  { id: "jisseki-18", label: "イベント・企画をやり遂げた" },
  { id: "jisseki-19", label: "コスト削減の工夫をした" },
  { id: "jisseki-20", label: "目標数値を達成した" },
];

const JITSURYOKU_ITEMS: readonly JitsuItem[] = [
  { id: "jitsuryoku-01", label: "誰がやっても同じ品質になる手順で施術できる" },
  { id: "jitsuryoku-02", label: "初見の症例でも基本に沿って対応できる" },
  { id: "jitsuryoku-03", label: "質問に根拠を添えて答えられる" },
  { id: "jitsuryoku-04", label: "機器のトラブルに一人で対処できる" },
  { id: "jitsuryoku-05", label: "マニュアルなしで正確に遂行できる" },
  { id: "jitsuryoku-06", label: "新人に教えられるレベルで説明できる" },
  { id: "jitsuryoku-07", label: "忙しい時でも品質が落ちない" },
  { id: "jitsuryoku-08", label: "複数の業務を同水準でこなせる" },
  { id: "jitsuryoku-09", label: "知識のアップデートが業務に反映されている" },
  { id: "jitsuryoku-10", label: "迷う場面で適切に相談・エスカレーションできる" },
  { id: "jitsuryoku-11", label: "患者対応の引き出しが多い" },
  { id: "jitsuryoku-12", label: "施術・説明の再現性が高い" },
  { id: "jitsuryoku-13", label: "緊急対応の手順が身についている" },
  { id: "jitsuryoku-14", label: "感染対策・安全手順が習慣化している" },
  { id: "jitsuryoku-15", label: "記録・書類の質が安定している" },
  { id: "jitsuryoku-16", label: "難しい説明をわかりやすく言い換えられる" },
  { id: "jitsuryoku-17", label: "他職種の業務も理解して連携できる" },
  { id: "jitsuryoku-18", label: "教わったことを応用できる" },
  { id: "jitsuryoku-19", label: "プレッシャー下でも平常心で対応できる" },
  { id: "jitsuryoku-20", label: "院外でも通用する専門性がある" },
];

const JITSUGEN_ITEMS: readonly JitsuItem[] = [
  { id: "jitsugen-01", label: "目標・ビジョンを言語化している" },
  { id: "jitsugen-02", label: "セミナー・研修に自ら申し込んだ" },
  { id: "jitsugen-03", label: "再受講を続けている" },
  { id: "jitsugen-04", label: "学びを翌日の行動に変えている" },
  { id: "jitsugen-05", label: "読書・教材学習を継続している" },
  { id: "jitsugen-06", label: "学んだ内容をノートに整理している" },
  { id: "jitsugen-07", label: "上位者に自ら教えを求めた" },
  { id: "jitsugen-08", label: "苦手分野の学習に取り組んだ" },
  { id: "jitsugen-09", label: "資格取得へ計画的に勉強している" },
  { id: "jitsugen-10", label: "業界セミナーに参加した" },
  { id: "jitsugen-11", label: "学びの計画と進捗を管理している" },
  { id: "jitsugen-12", label: "ビジョンに向けた行動を面談で語れる" },
  { id: "jitsugen-13", label: "新しい技術・機器を進んで学んだ" },
  { id: "jitsugen-14", label: "学びの成果を業務改善につなげた" },
  { id: "jitsugen-15", label: "ロールモデルから意識的に学んでいる" },
  { id: "jitsugen-16", label: "振り返りから次の学習テーマを決めている" },
  { id: "jitsugen-17", label: "院内講師・発表に挑戦した" },
  { id: "jitsugen-18", label: "学び続ける姿勢が周囲に伝わっている" },
  { id: "jitsugen-19", label: "未経験の役割に手を挙げた" },
  { id: "jitsugen-20", label: "自分の成長課題を自覚し取り組んでいる" },
];

const JUJITSU_ITEMS: readonly JitsuItem[] = [
  { id: "jujitsu-01", label: "生き生きと働いている姿が見える" },
  { id: "jujitsu-02", label: "仕事の目的を自分の言葉で語れる" },
  { id: "jujitsu-03", label: "やらされ感ではなく自分から動いている" },
  { id: "jujitsu-04", label: "仕事の中に楽しみを見つけている" },
  { id: "jujitsu-05", label: "忙しくても表情が明るい" },
  { id: "jujitsu-06", label: "前向きな発言が多い" },
  { id: "jujitsu-07", label: "新しい仕事を前向きに受け止める" },
  { id: "jujitsu-08", label: "自分の成長を実感として語れる" },
  { id: "jujitsu-09", label: "仕事と生活の充実が両立している" },
  { id: "jujitsu-10", label: "朝から気持ちの良いスタートを切っている" },
  { id: "jujitsu-11", label: "周囲にエネルギーを与えている" },
  { id: "jujitsu-12", label: "感謝の言葉が自然に出ている" },
  { id: "jujitsu-13", label: "小さな成功を喜べる" },
  { id: "jujitsu-14", label: "困難も成長機会として語れる" },
  { id: "jujitsu-15", label: "休み明けも良い状態で戻ってくる" },
  { id: "jujitsu-16", label: "自分の役割に誇りを持っている" },
  { id: "jujitsu-17", label: "チームの雰囲気を明るくしている" },
  { id: "jujitsu-18", label: "仕事の意味づけが前向き" },
  { id: "jujitsu-19", label: "心身のコンディションを整えて臨んでいる" },
  { id: "jujitsu-20", label: "「ここで働けてよかった」と語れる" },
];

const SEIJITSU_ITEMS: readonly JitsuItem[] = [
  { id: "seijitsu-01", label: "約束した期限・内容を守った" },
  { id: "seijitsu-02", label: "できないことは正直に伝えた" },
  { id: "seijitsu-03", label: "ミスを隠さずすぐ報告した" },
  { id: "seijitsu-04", label: "見ていない所でも同じ品質で仕事をしている" },
  { id: "seijitsu-05", label: "発言と行動が一致している" },
  { id: "seijitsu-06", label: "患者さんへの説明に誇張がない" },
  { id: "seijitsu-07", label: "不利な事実も正確に共有した" },
  { id: "seijitsu-08", label: "陰と表で言うことが同じ" },
  { id: "seijitsu-09", label: "ルール・手順を守り続けている" },
  { id: "seijitsu-10", label: "誘惑があっても近道をしない" },
  { id: "seijitsu-11", label: "自分の非を認めて謝れた" },
  { id: "seijitsu-12", label: "他者の成果を横取りしない" },
  { id: "seijitsu-13", label: "秘密・個人情報を厳守している" },
  { id: "seijitsu-14", label: "相手によって態度を変えない" },
  { id: "seijitsu-15", label: "引き受けたことを最後まで守った" },
  { id: "seijitsu-16", label: "本音で対話できる" },
  { id: "seijitsu-17", label: "フィードバックに言い訳をしない" },
  { id: "seijitsu-18", label: "日々の記録・報告が正確" },
  { id: "seijitsu-19", label: "小さな約束も軽んじない" },
  { id: "seijitsu-20", label: "一貫した姿勢が信頼されている" },
];

const KETSUJITSU_ITEMS: readonly JitsuItem[] = [
  { id: "ketsujitsu-01", label: "続けてきた練習が技術として定着した" },
  { id: "ketsujitsu-02", label: "続けた学習が資格合格に結実した" },
  { id: "ketsujitsu-03", label: "毎日の積み重ねで業務スピードが上がった" },
  { id: "ketsujitsu-04", label: "継続した発信が反響につながった" },
  { id: "ketsujitsu-05", label: "続けてきた声かけが患者さんとの信頼になった" },
  { id: "ketsujitsu-06", label: "続けた改善が院の仕組みとして定着した" },
  { id: "ketsujitsu-07", label: "継続した後輩支援が独り立ちという形になった" },
  { id: "ketsujitsu-08", label: "積み重ねた記録がマニュアルになった" },
  { id: "ketsujitsu-09", label: "続けてきた共有が文化になった" },
  { id: "ketsujitsu-10", label: "習慣化した整理整頓が職場の標準になった" },
  { id: "ketsujitsu-11", label: "継続した患者フォローがリピートにつながった" },
  { id: "ketsujitsu-12", label: "長期で取り組んだ課題を克服した" },
  { id: "ketsujitsu-13", label: "続けた自己管理が安定した勤務につながった" },
  { id: "ketsujitsu-14", label: "積み重ねた提案が大きな改善に実った" },
  { id: "ketsujitsu-15", label: "継続した学びが院内講師という役割に実った" },
  { id: "ketsujitsu-16", label: "貯めた気づきが勉強会テーマになった" },
  { id: "ketsujitsu-17", label: "続けてきた挑戦が新しい役割につながった" },
  { id: "ketsujitsu-18", label: "長く磨いた強みが院の看板になった" },
  { id: "ketsujitsu-19", label: "継続の姿が後輩の手本になっている" },
  { id: "ketsujitsu-20", label: "昨年できなかったことが今年はできている" },
];

export const JITSU_GROUPS: readonly JitsuGroup[] = [
  { key: "jikko", short: "実行", title: "実行（決めたことをやりきる）", items: JIKKO_ITEMS },
  { key: "jisseki", short: "実績", title: "実績（事実・数字で語れる成果）", items: JISSEKI_ITEMS },
  { key: "jitsuryoku", short: "実力", title: "実力（再現できる技術・知識・在り方）", items: JITSURYOKU_ITEMS },
  { key: "jitsugen", short: "実現", title: "実現（ビジョンに向けて学び続けている）", items: JITSUGEN_ITEMS },
  { key: "jujitsu", short: "充実", title: "充実（内側から満ちて働く）", items: JUJITSU_ITEMS },
  { key: "seijitsu", short: "誠実", title: "誠実（正直・言行一致・一貫性）", items: SEIJITSU_ITEMS },
  { key: "ketsujitsu", short: "結実", title: "結実（継続した努力が形になる）", items: KETSUJITSU_ITEMS },
];

/** id → 項目（表示時に文言を引くための索引） */
export const JITSU_ITEM_BY_ID: ReadonlyMap<
  string,
  JitsuItem & { group: JitsuGroupKey }
> = new Map(
  JITSU_GROUPS.flatMap((g) =>
    g.items.map((it) => [it.id, { ...it, group: g.key }] as const)
  )
);

/** 保存値の正規化: 実在するidだけを、定義順に重複なく残す */
export function normalizeJitsuChecks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(
    raw.filter((v): v is string => typeof v === "string" && JITSU_ITEM_BY_ID.has(v))
  );
  const ordered: string[] = [];
  for (const g of JITSU_GROUPS) {
    for (const it of g.items) if (set.has(it.id)) ordered.push(it.id);
  }
  return ordered;
}

/** グループごとのチェック数（バッジ表示用。合計点や順位は出さない） */
export function countByGroup(checks: string[]): Record<JitsuGroupKey, number> {
  const out = {
    jikko: 0,
    jisseki: 0,
    jitsuryoku: 0,
    jitsugen: 0,
    jujitsu: 0,
    seijitsu: 0,
    ketsujitsu: 0,
  } as Record<JitsuGroupKey, number>;
  for (const id of checks) {
    const it = JITSU_ITEM_BY_ID.get(id);
    if (it) out[it.group] += 1;
  }
  return out;
}
