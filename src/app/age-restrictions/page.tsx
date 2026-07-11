"use client";

import { useState, useMemo } from "react";

type AgeRestrictionDrug = {
  id: string;
  name: string;
  genericName: string;
  category: string;
  ageRule: {
    type: "prohibited_under" | "prohibited_over" | "age_specific" | "concentration_age";
    description: string;
    detail: string;
    warningLevel: "danger" | "warning" | "info";
  }[];
  clinicalNote: string;
  source: string;
  links: { label: string; url: string }[];
};

const ageRestrictionDrugs: AgeRestrictionDrug[] = [
  // ===外用免疫抑制薬===

  {
    id: "protopic-01",
    name: "プロトピック軟膏0.1%",
    genericName: "タクロリムス水和物",
    category: "免疫抑制外用（カルシニューリン阻害薬）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "【禁忌】2歳未満",
        detail: "添付文書2.4：低出生体重児・新生児・乳児・2歳未満の幼児には使用しないこと。2歳未満を対象とした臨床試験は実施していない。",
        warningLevel: "danger",
      },
      {
        type: "prohibited_under",
        description: "【禁忌】16歳未満（0.1%製剤）",
        detail: "16歳未満の小児には0.1%は使用不可。2歳〜15歳には0.03%小児用製剤を使用すること。0.1%製剤は16歳以上の成人のみ。血中濃度が高くなり腎障害等の副作用発現リスクあり。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "【疑義照会頻出】16歳未満への0.1%処方は禁忌。必ず0.03%小児用を処方。2歳未満への処方はいかなる濃度も禁忌。",
    source: "PMDA添付文書（プロトピック軟膏0.1%）Section 2.4・9.7",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=45821" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "protopic-003",
    name: "プロトピック軟膏0.03%小児用",
    genericName: "タクロリムス水和物",
    category: "免疫抑制外用（カルシニューリン阻害薬）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "【禁忌】2歳未満",
        detail: "添付文書2.4：低出生体重児・新生児・乳児・2歳未満の幼児には使用しないこと。",
        warningLevel: "danger",
      },
      {
        type: "age_specific",
        description: "適応：2歳以上15歳以下（小児用）",
        detail: "2歳〜15歳の小児が主な適応。16歳以上の成人にも0.03%は処方可（ただし成人では通常0.1%を使用）。年齢別塗布量制限あり：2〜5歳1g、6〜12歳2〜4g、13歳以上5g。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2歳未満への処方で薬局から疑義照会。「小児用」とあるが16歳以上の成人にも処方可能。1日2回の場合は12時間間隔を守ること。",
    source: "PMDA添付文書（プロトピック軟膏0.03%小児用）Section 2.4・9.7・7.1",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=49740" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "corectim-025",
    name: "コレクチム軟膏0.25%",
    genericName: "デルゴシチニブ",
    category: "免疫抑制外用（外用JAK阻害薬）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "生後6ヶ月未満：安全性未確立",
        detail: "添付文書9.7：生後6ヶ月未満の乳児を対象とした臨床試験は実施していない。2023年1月に「2歳以上」から「生後6ヶ月以上」に適応拡大。生後6ヶ月未満（低出生体重児・新生児含む）には使用しないこと。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応：生後6ヶ月以上（小児が主対象）",
        detail: "主に生後6ヶ月〜の小児に使用。成人でも皮膚が薄い部位や軽症例に使用可能。塗布量：1回最大5g・1日10g・体表面積30%まで。生後6ヶ月〜2歳未満は1回最大2.5g。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2023年1月の適応拡大で生後6ヶ月〜に使用可能になった（以前は2歳以上）。古い情報による疑義照会に注意。",
    source: "PMDA添付文書（コレクチム軟膏0.25%）2023年1月改訂・Section 9.7",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=70547" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "corectim-05",
    name: "コレクチム軟膏0.5%",
    genericName: "デルゴシチニブ",
    category: "免疫抑制外用（外用JAK阻害薬）",
    ageRule: [
      {
        type: "age_specific",
        description: "成人（16歳以上）が主対象。小児も症状により使用可",
        detail: "添付文書用法用量：「通常、成人には0.5%製剤を使用。小児には0.25%製剤が原則だが、症状に応じて0.5%製剤を使用することができる」。16歳未満への0.5%使用は禁忌ではないが、小児では原則0.25%から開始し改善後は0.25%へ変更を検討。塗布量：1回最大5g（小児は体格考慮）・体表面積30%まで。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "0.5%は成人（16歳以上）が主対象だが小児への使用も可能（禁忌ではない）。小児には原則0.25%から開始。4週間で改善なければ中止。",
    source: "PMDA添付文書（コレクチム軟膏0.5%）用法及び用量・2025年12月改訂版",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=69357" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "moizelto-03",
    name: "モイゼルト軟膏0.3%",
    genericName: "ジファミラスト",
    category: "PDE4阻害薬外用",
    ageRule: [
      {
        type: "prohibited_under",
        description: "生後3ヶ月未満：安全性未確立",
        detail: "添付文書（2023年12月改訂）：生後3ヶ月未満の乳児を対象とした臨床試験は実施していない。発売当初（2022年6月）は「2歳未満では使用しない」だったが、2023年12月改訂で「生後3ヶ月以上」に適応拡大。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応：生後3ヶ月以上〜14歳は0.3%が主。15歳以上は1%",
        detail: "0.3%：生後3ヶ月〜14歳が主対象（小児に応じて1%も可）。1%：15歳以上が主対象。塗布量制限なし（プロトピック・コレクチムと異なる特徴）。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2023年12月改訂で生後3ヶ月〜に適応拡大。古い情報（「2歳から」）による疑義照会に注意。塗布量制限なしが特徴（他の非ステロイド外用と異なる）。",
    source: "PMDA添付文書（モイゼルト軟膏0.3%）2023年12月改訂版",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=71200" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "moizelto-1",
    name: "モイゼルト軟膏1%",
    genericName: "ジファミラスト",
    category: "PDE4阻害薬外用",
    ageRule: [
      {
        type: "age_specific",
        description: "15歳以上が主対象。小児（生後3ヶ月〜14歳）でも症状により使用可",
        detail: "1%は15歳以上の成人用が主。小児でも症状が重い場合や改善に応じて医師判断で使用可能。改善した場合は0.3%への変更を検討。塗布量制限なし。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "小児への1%使用は医師判断で可能。原則は0.3%から開始して状態改善後に0.3%継続またはへ変更。",
    source: "PMDA添付文書（モイゼルト軟膏1%）",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=71201" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "vtama",
    name: "ブイタマークリーム1%",
    genericName: "タピナロフ",
    category: "AhR調節薬外用",
    ageRule: [
      {
        type: "prohibited_under",
        description: "12歳未満：安全性未確立",
        detail: "添付文書：12歳未満を対象とした臨床試験は実施していない。適応は12歳以上。2024年10月29日発売の最新外用薬。アトピー性皮膚炎・尋常性乾癬に適応。1日1回塗布（他の非ステロイド外用より少ない）。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応：12歳以上",
        detail: "非ステロイド系外用薬の中で最も高い年齢制限（12歳以上）。副作用として使用初期に頭痛が出ることがある（珍しい外用薬の副作用）。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2024年10月発売の最新薬。12歳未満への処方は適応外でレセプト査定の対象になりうる。使用初期の頭痛に注意（患者説明要）。",
    source: "PMDA添付文書（ブイタマークリーム1%）2024年10月承認",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=71779" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },

  // ===テトラサイクリン系抗菌薬===

  {
    id: "minocycline",
    name: "ミノマイシン（ミノサイクリン）",
    genericName: "ミノサイクリン塩酸塩",
    category: "抗菌薬内服（テトラサイクリン系）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "【原則禁忌】8歳未満",
        detail: "添付文書9.7：歯牙の着色・エナメル質形成不全、骨発育不全が生じる可能性があるため、原則として8歳未満の小児には投与しないこと。やむを得ず投与する場合は、治療上の有益性が危険性を上回ると判断した場合のみ。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "【レセプト審査頻出】ニキビで処方されることが多いが8歳未満は原則禁忌。8歳未満への処方はレセプト審査で返戻・査定される可能性が高い。永久歯の黄染リスクのため。",
    source: "PMDA添付文書（ミノマイシン錠/顆粒）Section 9.7",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=4254" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "doxycycline",
    name: "ビブラマイシン（ドキシサイクリン）",
    genericName: "ドキシサイクリン塩酸塩水和物",
    category: "抗菌薬内服（テトラサイクリン系）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "【原則禁忌】8歳未満",
        detail: "添付文書9.7：歯牙着色・骨発育不全のリスクから8歳未満は原則禁忌。ミノサイクリンと異なり歯への沈着は少ないとの報告があるが、添付文書上は8歳未満禁忌が維持されている。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "添付文書上は8歳未満原則禁忌。科学的にはドキシサイクリンの短期使用では歯への影響が少ないとの報告もあるが、保険診療上は添付文書に従う必要あり。",
    source: "PMDA添付文書（ビブラマイシン錠）Section 9.7",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=6756" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },

  // ===生物学的製剤===

  {
    id: "dupixent",
    name: "デュピクセント",
    genericName: "デュピルマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "prohibited_under",
        description: "【AD】生後6ヶ月未満は適応外",
        detail: "添付文書9.7：アトピー性皮膚炎の生後6ヶ月未満の乳児を対象とした臨床試験は実施していない。2023年9月25日に生後6ヶ月以上の小児ADへ適応拡大。小児は体重別用量：5kg〜15kg未満→200mg/4週、15kg〜30kg未満→300mg/4週、30kg〜60kg未満→初回400mg/以降200mg/2週、60kg以上→初回600mg/以降300mg/2週。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "疾患により適応年齢が異なる（重要！）",
        detail: "【AD】生後6ヶ月以上。【結節性痒疹】成人のみ（小児適応なし）。【特発性慢性蕁麻疹（CSU）】12歳以上かつ体重30kg以上（添付文書9.7）。適応疾患によって使用可能年齢が異なるため注意。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "【重要】疾患によって適応年齢が全く異なる。AD→生後6ヶ月〜。結節性痒疹→成人のみ。CSU→12歳以上かつ体重30kg以上。小児ADは体重別用量の確認必須。レセプト摘要欄にIGA・EASIスコア等の記載必要。",
    source: "PMDA添付文書（デュピクセント皮下注）2023年9月改訂版・Section 9.7",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=71752" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "mitiga60",
    name: "ミチーガ60mgシリンジ",
    genericName: "ネモリズマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "age_specific",
        description: "【AD】添付文書要確認（成人中心）。【結節性痒疹】13歳以上",
        detail: "60mgシリンジ（AD用）：添付文書で対象年齢を確認すること。30mgバイアル（結節性痒疹用）：13歳以上に適応。小児ADへの適応については最新の添付文書を必ず参照。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "30mgバイアル（結節性痒疹）は13歳以上のみ。60mgシリンジ（AD）の小児適応詳細は添付文書最新版で確認。院内投与のみ（自己注射はシリンジのみ可）。",
    source: "PMDA添付文書（ミチーガ皮下注60mgシリンジ・30mgバイアル）",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=70617" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "ebglyss",
    name: "イブグリース",
    genericName: "レブリキズマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "prohibited_under",
        description: "12歳未満または体重40kg未満は適応外",
        detail: "添付文書用法用量：「通常、成人及び12歳以上かつ体重40kg以上の小児には...」。年齢が12歳以上でも体重40kg未満は適応外。2024年1月承認・2024年5月発売。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応：12歳以上かつ体重40kg以上",
        detail: "年齢と体重の両方の条件を満たす必要がある。体重40kg未満の12〜13歳には使用不可。2025年5月より在宅自己注射対応開始。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "年齢（12歳以上）と体重（40kg以上）の両方を確認すること。どちらか一方でも満たさない場合は適応外。レセプト審査で返戻リスクあり。",
    source: "PMDA添付文書（イブグリース皮下注250mg）2024年1月承認・医薬品リスク管理計画書",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=71220" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "cosentyx",
    name: "コセンティクス",
    genericName: "セクキヌマブ（遺伝子組換え）",
    category: "生物学的製剤（乾癬）",
    ageRule: [
      {
        type: "age_specific",
        description: "乾癬：6歳以上の小児に適応（体重別用量あり）",
        detail: "2021年9月に6歳以上の小児乾癬に適応拡大（生物学的製剤で初の小児乾癬適応）。体重別用量：25kg未満→75mg、25〜50kg未満→75mgまたは150mg、50kg以上→150mg。効果不十分時は各用量倍増可。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "6歳以上の小児乾癬に使用可能。小児には体重別用量の確認が必須。レセプト摘要欄に体重・用量根拠の記載推奨。",
    source: "PMDA添付文書（コセンティクス皮下注）2021年9月改訂版",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=70095" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
  {
    id: "xolair",
    name: "ゾレア",
    genericName: "オマリズマブ（遺伝子組換え）",
    category: "生物学的製剤（慢性蕁麻疹）",
    ageRule: [
      {
        type: "prohibited_under",
        description: "慢性蕁麻疹：15歳未満は適応外",
        detail: "慢性特発性蕁麻疹の適応は15歳以上。喘息適応では6歳以上に適応あり（皮膚科では主に蕁麻疹で使用）。体重とIgE値による用量設定（75mg・150mg・300mgから選択）が必要。院内投与のみ（自己注射不可）。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "蕁麻疹での使用は15歳以上のみ。15歳未満への蕁麻疹目的の処方は適応外でレセプト返戻の対象。処方時は体重とIgE値から用量設定表で確認。",
    source: "PMDA添付文書（ゾレア皮下注）慢性特発性蕁麻疹の適応Section",
    links: [
      { label: "今日の臨床サポート", url: "https://clinicalsup.jp/jpoc/drugdetails.aspx?code=49022" },
      { label: "PMDA添付文書検索", url: "https://www.pmda.go.jp/PmdaSearch/iyakuSearch/" },
    ],
  },
];

// カテゴリフィルター用マッピング
const FILTER_GROUPS: { label: string; value: string; match: (cat: string) => boolean }[] = [
  { label: "すべて", value: "all", match: () => true },
  {
    label: "外用免疫抑制薬",
    value: "topical",
    match: (cat) =>
      cat.includes("免疫抑制外用") || cat.includes("PDE4") || cat.includes("AhR"),
  },
  {
    label: "テトラサイクリン系",
    value: "tetracycline",
    match: (cat) => cat.includes("テトラサイクリン"),
  },
  {
    label: "生物学的製剤",
    value: "biologics",
    match: (cat) => cat.includes("生物学的製剤"),
  },
];

const LEVEL_STYLES = {
  danger: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-800",
    icon: "🚫",
    badge: "bg-red-100 text-red-700 border-red-300",
  },
  warning: {
    bg: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-800",
    icon: "⚠️",
    badge: "bg-orange-100 text-orange-700 border-orange-300",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    text: "text-blue-800",
    icon: "ℹ️",
    badge: "bg-blue-100 text-blue-700 border-blue-300",
  },
} as const;

function getHighestWarningLevel(drug: AgeRestrictionDrug): "danger" | "warning" | "info" {
  if (drug.ageRule.some((r) => r.warningLevel === "danger")) return "danger";
  if (drug.ageRule.some((r) => r.warningLevel === "warning")) return "warning";
  return "info";
}

// クイックリファレンス用の要約を取得
function getQuickSummary(drug: AgeRestrictionDrug): string {
  const dangerRule = drug.ageRule.find((r) => r.warningLevel === "danger");
  if (dangerRule) return dangerRule.description;
  const warningRule = drug.ageRule.find((r) => r.warningLevel === "warning");
  if (warningRule) return warningRule.description;
  return drug.ageRule[0]?.description ?? "";
}

export default function AgeRestrictionsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const activeFilter = FILTER_GROUPS.find((f) => f.value === filter) ?? FILTER_GROUPS[0];

  const filtered = useMemo(() => {
    return ageRestrictionDrugs.filter((drug) => {
      if (!activeFilter.match(drug.category)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          drug.name.toLowerCase().includes(q) ||
          drug.genericName.toLowerCase().includes(q) ||
          drug.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filter, search, activeFilter]);

  const dangerCount = ageRestrictionDrugs.filter((d) =>
    d.ageRule.some((r) => r.warningLevel === "danger")
  ).length;
  const warningCount = ageRestrictionDrugs.filter(
    (d) => getHighestWarningLevel(d) === "warning"
  ).length;

  return (
    <div className="max-w-[1536px] mx-auto space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">
          👶 年齢注意が必要な薬剤
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          年齢制限を誤ると薬局から疑義照会が入ったり、レセプト審査で返戻・査定となる場合があります。処方・調剤前に必ず確認してください。
        </p>
      </div>

      {/* 注意バナー */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <div className="text-sm text-amber-800">
            <p className="font-semibold">
              本情報はPMDA添付文書に基づくスタッフ研修用資料です。添付文書は随時改訂されます。処方前に最新の添付文書を確認してください。
            </p>
            <p className="mt-0.5">
              禁忌/原則禁忌{" "}
              <span className="font-bold text-red-700">{dangerCount}件</span>・要注意{" "}
              <span className="font-bold text-orange-700">{warningCount}件</span> を含む{" "}
              <span className="font-bold">{ageRestrictionDrugs.length}薬剤</span>{" "}
              を掲載しています。
            </p>
            <p className="mt-1">
              <a
                href="https://www.pmda.go.jp/PmdaSearch/iyakuSearch/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline font-medium"
              >
                → PMDA電子添付文書検索（最新版はこちら）
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* クイックリファレンス表 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          📋 年齢制限クイックリファレンス
        </h2>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "42%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-800">
                    薬剤名
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-800">
                    年齢制限（要約）
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-800">
                    レベル
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-800">
                    添付文書
                  </th>
                </tr>
              </thead>
              <tbody>
                {ageRestrictionDrugs.map((drug) => {
                  const highest = getHighestWarningLevel(drug);
                  const style = LEVEL_STYLES[highest];
                  return (
                    <tr key={drug.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-1.5">
                        <p className="font-medium text-xs truncate">{drug.name}</p>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-slate-600 truncate">
                        {getQuickSummary(drug)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${style.badge}`}
                        >
                          {style.icon}{" "}
                          {highest === "danger"
                            ? "禁忌"
                            : highest === "warning"
                              ? "注意"
                              : "情報"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <a
                          href={drug.links[0]?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:text-blue-800"
                          title={drug.links[0]?.label}
                        >
                          🔗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* カテゴリフィルター（モバイル横スクロール） */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
        {FILTER_GROUPS.map((f) => {
          const count =
            f.value === "all"
              ? ageRestrictionDrugs.length
              : ageRestrictionDrugs.filter((d) => f.match(d.category)).length;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`whitespace-nowrap flex-shrink-0 text-sm px-4 py-2 rounded-full border transition-colors min-h-[36px] ${
                filter === f.value
                  ? "bg-teal text-white border-teal"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className="ml-1 text-xs opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 検索 */}
      <input
        type="text"
        placeholder="薬品名・一般名・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-teal/40"
      />

      {/* 薬剤カード一覧 */}
      <div className="space-y-4">
        {filtered.map((drug) => {
          const highest = getHighestWarningLevel(drug);
          const highestStyle = LEVEL_STYLES[highest];

          return (
            <div
              key={drug.id}
              className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              {/* カードヘッダー */}
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${highestStyle.badge}`}
                >
                  {highestStyle.icon}{" "}
                  {highest === "danger"
                    ? "禁忌"
                    : highest === "warning"
                      ? "注意"
                      : "情報"}
                </span>
                <h3 className="font-bold text-slate-800">{drug.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                  {drug.category}
                </span>
              </div>
              <div className="px-4 pt-1 pb-2">
                <p className="text-xs text-muted-foreground">{drug.genericName}</p>
              </div>

              {/* 年齢制限ルール */}
              <div className="px-4 pb-3 space-y-2">
                <p className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  年齢制限
                </p>
                {drug.ageRule.map((rule, i) => {
                  const style = LEVEL_STYLES[rule.warningLevel];
                  return (
                    <div
                      key={i}
                      className={`rounded-md border px-3 py-2 ${style.bg} ${style.border}`}
                    >
                      <p className={`text-sm font-semibold ${style.text}`}>
                        {style.icon} {rule.description}
                      </p>
                      <p className={`text-xs mt-1 ${style.text} opacity-80`}>{rule.detail}</p>
                    </div>
                  );
                })}
              </div>

              {/* 臨床ノート・出典 */}
              <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3">
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-700">💡 臨床上の注意</p>
                  <p className="text-xs text-amber-800 mt-0.5">{drug.clinicalNote}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">📚 {drug.source}</span>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {drug.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                    >
                      🔗 {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            該当する薬剤が見つかりません
          </div>
        )}
      </div>

      {/* 注意書き */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>本情報はPMDA電子添付文書に基づくスタッフ研修用資料です。</p>
        <p>
          添付文書は改訂される場合があります。処方前に必ず最新の添付文書を確認してください。
        </p>
        <p>不明な点は薬局・メーカーに確認してください。</p>
      </div>
    </div>
  );
}
