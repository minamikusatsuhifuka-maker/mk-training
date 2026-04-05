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
};

const ageRestrictionDrugs: AgeRestrictionDrug[] = [
  // ===外用免疫抑制薬===
  {
    id: "protopic-01",
    name: "プロトピック軟膏0.1%",
    genericName: "タクロリムス水和物",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "2歳未満：禁忌",
        detail: "添付文書2.4：低出生体重児・新生児・乳児・2歳未満の幼児には使用しないこと。2歳未満を対象とした臨床試験は実施していない。",
        warningLevel: "danger",
      },
      {
        type: "prohibited_under",
        description: "16歳未満：禁忌（0.1%製剤）",
        detail: "添付文書：16歳未満の小児には0.03%小児用製剤を使用すること。0.1%は成人（16歳以上）のみ適応。血中濃度が高くなり副作用が発現する可能性がある。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "⚠️ 疑義照会頻出！16歳未満への0.1%処方は禁忌。必ず0.03%小児用を処方。2歳未満への処方はいかなる濃度も禁忌のため疑義照会が入る。",
    source: "PMDA添付文書（プロトピック軟膏0.1%）Section 2.4・9.7",
  },
  {
    id: "protopic-003",
    name: "プロトピック軟膏0.03%小児用",
    genericName: "タクロリムス水和物",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "2歳未満：禁忌",
        detail: "添付文書2.4：低出生体重児・新生児・乳児・2歳未満の幼児には使用しないこと。",
        warningLevel: "danger",
      },
      {
        type: "age_specific",
        description: "適応年齢：2歳以上15歳以下",
        detail: "2歳〜15歳の小児に適応。16歳以上の成人には0.1%製剤を使用（小児用0.03%でも可）。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2歳未満への処方で疑義照会。「小児用」とあるが16歳以上の成人にも処方可能（ただし0.1%の方が有効）。",
    source: "PMDA添付文書（プロトピック軟膏0.03%小児用）Section 2.4・9.7",
  },
  {
    id: "kolecchim-025",
    name: "コレクチム軟膏0.25%（小児用）",
    genericName: "デルゴシチニブ",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "生後6ヶ月未満：使用不可",
        detail: "添付文書9.7：生後6ヶ月未満の乳児を対象とした臨床試験は実施していない。生後6ヶ月以上の小児に適応。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応年齢：生後6ヶ月〜15歳",
        detail: "0.25%は生後6ヶ月以上の小児専用製剤。16歳以上には0.5%成人用を使用。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "生後6ヶ月未満への処方・16歳以上への0.25%処方（成人用0.5%が正しい）で疑義照会の可能性。塗布量制限あり（1回5g・1日10gまで）。",
    source: "PMDA添付文書（コレクチム軟膏0.25%）Section 9.7",
  },
  {
    id: "kolecchim-05",
    name: "コレクチム軟膏0.5%（成人用）",
    genericName: "デルゴシチニブ",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "age_specific",
        description: "成人（16歳以上）が主対象。小児は原則0.25%を使用",
        detail: "添付文書用法用量：「通常、成人には0.5%製剤を使用。小児には0.25%製剤が原則だが、症状に応じて0.5%製剤を使用することができる」。16歳未満への0.5%使用は禁忌ではなく、症状に応じて医師判断で使用可能。ただし改善後は0.25%へ変更を検討すること。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "0.5%は成人（16歳以上）が主対象。小児（生後6ヶ月〜）への使用は原則0.25%から。ただし症状が重い場合は医師判断で小児にも0.5%使用可。「16歳未満禁忌」ではない点に注意。塗布量は体表面積30%・1回5gまで（小児は体格考慮）。",
    source: "PMDA添付文書（コレクチム軟膏0.5%）用法及び用量・2025年12月改訂版",
  },
  {
    id: "moizelto-03",
    name: "モイゼルト軟膏0.3%",
    genericName: "ジファミラスト",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "生後3ヶ月未満：使用不可",
        detail: "添付文書（2023年12月改訂）：生後3ヶ月未満の乳児を対象とした臨床試験は実施していない。当初は2歳未満が対象外だったが、2023年12月の改訂で生後3ヶ月以上に適応拡大。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応年齢：生後3ヶ月〜14歳",
        detail: "0.3%は生後3ヶ月以上14歳以下。症状に応じて1%も使用可能。塗布量制限なし（プロトピック・コレクチムと異なる）。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2023年12月改訂で適応が2歳→生後3ヶ月に拡大。古い情報で疑義照会が入る場合あり。塗布量制限なしが特徴。",
    source: "PMDA添付文書（モイゼルト軟膏0.3%）2023年12月改訂版",
  },
  {
    id: "moizelto-1",
    name: "モイゼルト軟膏1%",
    genericName: "ジファミラスト",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "age_specific",
        description: "原則15歳以上（成人用）",
        detail: "1%は主に15歳以上の成人用。ただし小児（生後3ヶ月〜14歳）でも症状に応じて医師判断で使用可能。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "小児（生後3ヶ月〜14歳）への1%処方は医師の判断で可能だが、原則0.3%から開始し症状改善後は0.3%へ変更推奨。",
    source: "PMDA添付文書（モイゼルト軟膏1%）",
  },
  {
    id: "vtama",
    name: "ブイタマークリーム1%",
    genericName: "タピナロフ",
    category: "外用免疫抑制薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "12歳未満：使用不可",
        detail: "添付文書：12歳以上に適応。12歳未満を対象とした臨床試験は実施していない。2024年10月29日発売の新薬。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "適応年齢：12歳以上",
        detail: "アトピー性皮膚炎・尋常性乾癬に適応。1日1回塗布（他の外用免疫抑制薬より少ない回数）。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "2024年10月発売の最新薬。非ステロイド系外用薬で最も高い年齢制限（12歳以上）。12歳未満への処方で疑義照会。",
    source: "PMDA添付文書（ブイタマークリーム1%）2024年10月承認",
  },

  // ===抗菌薬===
  {
    id: "minocycline",
    name: "ミノマイシン（ミノサイクリン）",
    genericName: "ミノサイクリン塩酸塩",
    category: "抗菌薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "8歳未満：原則禁忌",
        detail: "添付文書：歯牙の着色・エナメル質形成不全、骨発育不全が生じる可能性がある。永久歯形成期（8歳未満）の小児には原則禁忌。やむを得ない場合のみ使用。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "⚠️ ニキビで処方される機会が多いが8歳未満は禁忌。永久歯への影響（歯の黄染）があるため。レセプト審査で厳しく確認される。",
    source: "PMDA添付文書（ミノマイシン錠）Section 9.7",
  },
  {
    id: "doxycycline",
    name: "ビブラマイシン（ドキシサイクリン）",
    genericName: "ドキシサイクリン塩酸塩水和物",
    category: "抗菌薬",
    ageRule: [
      {
        type: "prohibited_under",
        description: "8歳未満：禁忌",
        detail: "添付文書：歯牙着色・骨発育不全のリスク。ただし短期使用（21日未満）では歯への影響が少ないとの報告あり（MSDマニュアル参照）。添付文書上は8歳未満禁忌が維持されている。",
        warningLevel: "danger",
      },
    ],
    clinicalNote: "添付文書上は8歳未満禁忌。ニキビ治療で処方される際は患者年齢を必ず確認。疑義照会・レセプト審査の対象となりやすい。",
    source: "PMDA添付文書（ビブラマイシン錠）Section 9.7",
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
        description: "生後6ヶ月未満：適応外",
        detail: "2023年9月25日適応拡大：アトピー性皮膚炎は生後6ヶ月以上に適応拡大（以前は15歳以上）。体重により用量が異なる：15kg未満は200mg/4週、15kg以上30kg未満は300mg/4週、30kg以上は300mg/2週。",
        warningLevel: "warning",
      },
      {
        type: "age_specific",
        description: "年齢・体重別の用量設定あり",
        detail: "【アトピー性皮膚炎】生後6ヶ月〜：体重別用量。【結節性痒疹・慢性蕁麻疹】15歳以上のみ。適応疾患によって使用可能年齢が異なる点に注意。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "⚠️ 疾患によって適応年齢が異なる！AD→生後6ヶ月〜。結節性痒疹・蕁麻疹→15歳〜。小児への処方は体重別用量の確認必須。レセプト摘要欄にIGA・EASIスコア等の記載必要。",
    source: "PMDA添付文書（デュピクセント皮下注）2023年9月改訂",
  },
  {
    id: "mitiga",
    name: "ミチーガ60mg（シリンジ）",
    genericName: "ネモリズマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "age_specific",
        description: "適応年齢：アトピー性皮膚炎は成人のみ（添付文書要確認）",
        detail: "アトピー性皮膚炎への適応は現時点で成人が中心。小児への適応拡大については添付文書の最新版を確認すること。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "ミチーガ30mgバイアル（結節性痒疹）は13歳以上。60mgシリンジ（AD）の小児適応は添付文書で最新情報を確認。",
    source: "PMDA添付文書（ミチーガ皮下注）",
  },
  {
    id: "cosentyx",
    name: "コセンティクス",
    genericName: "セクキヌマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "age_specific",
        description: "小児（6歳以上）への適応あり",
        detail: "2021年9月に6歳以上の小児乾癬に適応拡大。体重により用量が異なる：体重25kg未満は75mg、25kg〜50kg未満は75mgまたは150mg、50kg以上は150mg。生物学的製剤で初の小児乾癬適応。",
        warningLevel: "info",
      },
    ],
    clinicalNote: "6歳以上の小児乾癬に使用可能。小児には体重別用量が設定されているため処方時に体重確認が必要。レセプト摘要欄に体重・用量の記載推奨。",
    source: "PMDA添付文書（コセンティクス皮下注）2021年9月改訂",
  },
  {
    id: "xolair",
    name: "ゾレア",
    genericName: "オマリズマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "prohibited_under",
        description: "慢性蕁麻疹：15歳未満は適応外",
        detail: "慢性特発性蕁麻疹の適応は15歳以上。体重とIgE値による用量設定が必要（75mg・150mg・300mgから選択）。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "蕁麻疹での使用は15歳以上のみ。処方時は体重とIgE値から用量決定表で用量を確認する。院内投与のみ（自己注射不可）。",
    source: "PMDA添付文書（ゾレア皮下注）",
  },
  {
    id: "ebglyss",
    name: "イブグリース",
    genericName: "レブリキズマブ（遺伝子組換え）",
    category: "生物学的製剤",
    ageRule: [
      {
        type: "age_specific",
        description: "12歳以上かつ体重40kg以上に適応",
        detail: "PMDA添付文書（2024年1月承認）：「通常、成人及び12歳以上かつ体重40kg以上の小児には...」と規定。12歳以上であっても体重40kg未満の場合は適応外。",
        warningLevel: "warning",
      },
    ],
    clinicalNote: "2024年5月発売。12歳以上かつ体重40kg以上が条件。年齢だけでなく体重も確認が必要。12歳以上でも体重40kg未満では適応外となりレセプト審査で査定の可能性。現時点では院内投与のみ（自己注射は2025年5月より在宅自己注射対応）。",
    source: "PMDA添付文書（イブグリース皮下注250mg）2024年1月承認・日本イーライリリー医薬品リスク管理計画書",
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

const CATEGORY_FILTERS = [
  { label: "すべて", value: "all" },
  { label: "外用免疫抑制薬", value: "外用免疫抑制薬" },
  { label: "抗菌薬", value: "抗菌薬" },
  { label: "生物学的製剤", value: "生物学的製剤" },
] as const;

function getHighestWarningLevel(drug: AgeRestrictionDrug): "danger" | "warning" | "info" {
  if (drug.ageRule.some((r) => r.warningLevel === "danger")) return "danger";
  if (drug.ageRule.some((r) => r.warningLevel === "warning")) return "warning";
  return "info";
}

export default function AgeRestrictionsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return ageRestrictionDrugs.filter((drug) => {
      if (filter !== "all" && drug.category !== filter) return false;
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
  }, [filter, search]);

  const dangerCount = ageRestrictionDrugs.filter((d) => d.ageRule.some((r) => r.warningLevel === "danger")).length;
  const warningCount = ageRestrictionDrugs.filter((d) => getHighestWarningLevel(d) === "warning").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">
          👶 年齢注意が必要な薬剤
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          年齢制限を誤ると薬局から疑義照会が入ったり、レセプト審査で返戻・査定となる場合があります。処方前に必ず確認してください。
        </p>
      </div>

      {/* 警告バナー */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <div className="text-sm text-amber-800">
            <p className="font-semibold">疑義照会・レセプト返戻の原因になりやすい薬剤一覧です</p>
            <p className="mt-0.5">
              禁忌 <span className="font-bold text-red-700">{dangerCount}件</span>・
              注意 <span className="font-bold text-orange-700">{warningCount}件</span> を含む{" "}
              <span className="font-bold">{ageRestrictionDrugs.length}薬剤</span> を掲載しています。
            </p>
          </div>
        </div>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
              filter === f.value
                ? "bg-teal text-white border-teal"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1 text-xs opacity-75">
                ({ageRestrictionDrugs.filter((d) => d.category === f.value).length})
              </span>
            )}
          </button>
        ))}
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
                  {highest === "danger" ? "禁忌" : highest === "warning" ? "注意" : "情報"}
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
                      <p className={`text-xs mt-1 ${style.text} opacity-80`}>
                        {rule.detail}
                      </p>
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
                <p className="text-[11px] text-muted-foreground">
                  📚 {drug.source}
                </p>
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
        <p>
          本情報はPMDA電子添付文書に基づくスタッフ研修用資料です。
        </p>
        <p>
          添付文書は改訂される場合があります。処方前に必ず最新の添付文書を確認してください。
        </p>
        <p>
          不明な点は薬局・メーカーに確認してください。
        </p>
      </div>
    </div>
  );
}
