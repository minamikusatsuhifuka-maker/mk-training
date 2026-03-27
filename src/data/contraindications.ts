export type Severity = "critical" | "caution" | "note";

export type Contraindication = {
  id: string;
  drug: string;
  disease: string;
  detail: string;
  severity: Severity;
};

export const contraindications: Contraindication[] = [
  { id: "c01", drug: "ステロイド全身投与（プレドニン等）", disease: "活動性感染症（細菌・真菌・ウイルス）", severity: "critical", detail: "感染症の活動期は免疫抑制で悪化リスク大。帯状疱疹・結核・真菌感染には特に注意。感染症治療と並行して慎重に使用。" },
  { id: "c02", drug: "ロアキュテイン（イソトレチノイン）", disease: "妊婦・妊娠可能性のある女性", severity: "critical", detail: "重大な催奇形性あり。妊娠中・妊娠の可能性がある場合は絶対禁忌。服用中・服用後1ヶ月は厳格な避妊必須。当院では2026年2月より運用変更済み。" },
  { id: "c03", drug: "テトラサイクリン系（ドキシサイクリン・ミノマイシン等）", disease: "妊婦・8歳未満小児", severity: "critical", detail: "胎児・小児の歯牙着色・骨発育障害リスク。妊婦（特に中・後期）および8歳未満には禁忌。" },
  { id: "c04", drug: "メソトレキセート", disease: "妊婦・重篤な肝障害・腎障害", severity: "critical", detail: "強力な催奇形性・骨髄抑制。妊婦・授乳婦禁忌。葉酸補給と定期血液検査が必須。週1回投与（連日投与は致死的過量投与リスク）。" },
  { id: "c05", drug: "JAK阻害薬内服（タリクスタ・オルミエント等）", disease: "活動性感染症・血栓症既往・悪性腫瘍", severity: "critical", detail: "帯状疱疹リスク増加のため抗ウイルス薬予防投与を検討。DVT・PE既往者は禁忌。開始前にTB・ウイルス肝炎スクリーニング必須。" },
  { id: "c06", drug: "イトリゾール（イトラコナゾール）", disease: "心不全・QT延長・多数の薬物相互作用", severity: "critical", detail: "陰性変力作用によりうっ血性心不全リスク。多数のCYP3A4阻害による薬物相互作用あり（スタチン・カルシウム拮抗薬等）。" },
  { id: "c07", drug: "生物学的製剤全般", disease: "活動性感染症・活動性結核・生ワクチン接種", severity: "critical", detail: "免疫抑制による感染症リスク。活動性結核・B型・C型肝炎キャリアは禁忌または慎重投与。開始前スクリーニング（TB・HBV・HCV）必須。" },
  { id: "c08", drug: "IPL・レーザー全般（ノーリス・MIINレーザー等）", disease: "日焼け直後・光線過敏症・妊婦", severity: "critical", detail: "日焼け肌への照射は火傷・色素沈着リスク大。光線過敏症（服薬中含む）は禁忌。妊娠中は原則禁忌。ポルフィリン症も禁忌。" },
  { id: "c09", drug: "デュピクセント（デュピルマブ）", disease: "活動性の感染症・生ワクチン（相対的禁忌）", severity: "caution", detail: "結膜炎・眼瞼炎の副作用に注意（頻度高め）。局所ステロイドとの併用が基本。妊娠中の使用は十分なデータなし。" },
  { id: "c10", drug: "ネオーラル（シクロスポリン）", disease: "腎障害・高血圧・生ワクチン・多数の薬物相互作用", severity: "caution", detail: "腎毒性・高血圧に注意。NSAIDs・アミノグリコシド系との併用で腎毒性増強。グレープフルーツジュースで血中濃度上昇。" },
  { id: "c11", drug: "プロトピック（タクロリムス外用）", disease: "皮膚感染症・免疫不全・2歳未満", severity: "caution", detail: "感染症の皮膚病変への使用禁忌。成人用（0.1%）は2歳以上・小児用（0.03%）は2〜15歳に使用。直射日光や紫外線療法との同日使用を避ける。" },
  { id: "c12", drug: "抗ヒスタミン薬（第一世代：ポララミン等）", disease: "緑内障・前立腺肥大・高齢者", severity: "caution", detail: "抗コリン作用による眼圧上昇・排尿困難・認知機能低下リスク。高齢者への長期投与は転倒リスクも増大。第二世代を優先使用。" },
  { id: "c13", drug: "NSAIDs（ロキソプロフェン等）", disease: "消化性潰瘍・重篤な腎障害・妊婦後期", severity: "caution", detail: "胃粘膜障害・腎血流低下。妊娠後期は胎児動脈管閉鎖リスクのため禁忌。長期使用時はPPI予防投与を考慮。" },
  { id: "c14", drug: "液体窒素凍結療法", disease: "寒冷蕁麻疹・レイノー病", severity: "caution", detail: "液体窒素の冷却刺激（-196℃）で過剰反応が起きる可能性。施術前に寒冷アレルギー・レイノー症状の確認を必ず行う。" },
  { id: "c15", drug: "ポテンツァ・針系機器", disease: "ケロイド体質・活動性ニキビ・凝固障害", severity: "caution", detail: "ケロイド体質は肥厚性瘢痕悪化リスク。活動性感染症・重度ニキビ部位への施術禁忌。ワーファリン・DOAC服用者は要注意。" },
];
