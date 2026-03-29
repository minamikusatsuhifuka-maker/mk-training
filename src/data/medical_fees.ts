export type FeeCategory = "初診・再診" | "医学管理" | "検査" | "処置" | "手術" | "皮膚科処置" | "注射" | "投薬";

export type MedicalFee = {
  id: string;
  code: string;
  name: string;
  points: number;
  category: FeeCategory;
  description: string;
  notes?: string;
  frequency?: string;
};

export const medicalFees: MedicalFee[] = [
  {id:"f01",code:"A000",name:"初診料",points:291,category:"初診・再診",description:"患者が初めて来院した際、または前回の治療が完了後に新たな疾病で受診した際に算定",notes:"時間外・休日・深夜加算あり。保険証確認必須"},
  {id:"f02",code:"A001",name:"再診料",points:75,category:"初診・再診",description:"2回目以降の外来受診時に算定",notes:"外来管理加算（52点）：処置・手術・検査等がない場合に算定可"},
  {id:"f03",code:"A001",name:"外来管理加算",points:52,category:"初診・再診",description:"再診料に加算。処置・手術・検査等を行わない場合で、患者の療養上必要な指導を行った場合",notes:"5分以上の診療が必要。処置・注射・リハビリ等を行った場合は算定不可"},
  {id:"f04",code:"B001-3",name:"生活習慣病管理料（皮膚科）",points:333,category:"医学管理",description:"慢性疾患（アトピー性皮膚炎等）の継続的な管理を行う場合",notes:"月1回算定。治療計画書の交付が必要"},
  {id:"f05",code:"B001-7",name:"難病外来指導管理料",points:270,category:"医学管理",description:"難病（天疱瘡・乾癬等の指定難病）患者への指導管理",notes:"月1回算定。指定難病に限定"},
  {id:"f06",code:"D006-11",name:"FLCRAスクリーニング検査（ドロップスクリーン）",points:200,category:"検査",description:"41種類のアレルゲン一括スクリーニング検査",notes:"アレルギー疾患の原因特定に使用"},
  {id:"f07",code:"D291-2",name:"アレルギー検査（View39・特異的IgE抗体）",points:1430,category:"検査",description:"39種類のアレルゲン特異的IgE抗体を一括測定",notes:"複数のアレルギー原因を一度に調べる"},
  {id:"f08",code:"D007",name:"皮膚生検（病理検査含む）",points:630,category:"検査",description:"皮膚の一部を切り取り組織学的に検査する",notes:"病理診断料が別途加算される"},
  {id:"f09",code:"D012",name:"梅毒血清反応（RPR）",points:34,category:"検査",description:"梅毒の診断のための血清学的検査",notes:"薬疹・バラ色粃糠疹との鑑別に使用"},
  {id:"f10",code:"D012",name:"QuantiFERON（QFT・結核感染検査）",points:300,category:"検査",description:"結核感染の診断。生物学的製剤開始前の必須スクリーニング",notes:"年1回算定可"},
  {id:"f11",code:"D015",name:"真菌検査（KOH直接鏡検）",points:60,category:"検査",description:"白癬・カンジダの直接鏡検診断",notes:"皮膚科で頻用"},
  {id:"f12",code:"D015",name:"細菌培養同定検査（皮膚）",points:178,category:"検査",description:"皮膚感染症の原因菌同定。MRSA確認等"},
  {id:"f13",code:"D023",name:"ウイルス抗原検査（ヘルペスウイルス）",points:204,category:"検査",description:"HSV・VZVの迅速抗原検査",notes:"帯状疱疹・単純ヘルペスの迅速診断"},
  {id:"f14",code:"J053",name:"皮膚科軟膏処置（100cm²未満）",points:55,category:"皮膚科処置",description:"外来で軟膏・創傷処置を行った場合",notes:"100cm²以上169cm²未満：90点"},
  {id:"f15",code:"J057",name:"軟属腫摘除（水いぼ）",points:74,category:"皮膚科処置",description:"伝染性軟属腫（水いぼ）の摘除処置",notes:"1個から算定可。複数個でも同点数"},
  {id:"f16",code:"J057-3",name:"鶏眼・胼胝処置",points:105,category:"皮膚科処置",description:"魚の目・たこの処置（足底の角質除去）",notes:"2か所以上でも同点数"},
  {id:"f17",code:"J054",name:"皮膚科レーザー照射療法（液体窒素）",points:290,category:"皮膚科処置",description:"液体窒素凍結療法（いぼ・日光角化症等）",notes:"2週間以上の間隔が必要"},
  {id:"f18",code:"J000",name:"創傷処置（100cm²未満）",points:60,category:"処置",description:"外傷・術後創傷の処置",notes:"100cm²以上500cm²未満：90点"},
  {id:"f19",code:"J001",name:"熱傷処置（100cm²未満）",points:135,category:"処置",description:"熱傷の処置（第1〜3度）",notes:"面積・深度により点数変動"},
  {id:"f20",code:"J053-2",name:"面皰圧出法（ニキビ処置）",points:49,category:"皮膚科処置",description:"面皰（コメド）の圧出処置",notes:"ざ瘡治療の一環として算定"},
  {id:"f21",code:"K005",name:"皮膚、皮下腫瘍摘出術（露出部・2cm未満）",points:1660,category:"手術",description:"顔・手・腕等の露出部での粉瘤・脂肪腫等の摘出",notes:"露出部2cm以上：3670点"},
  {id:"f22",code:"K005",name:"皮膚、皮下腫瘍摘出術（非露出部・3cm未満）",points:1280,category:"手術",description:"体幹・四肢等の非露出部での腫瘍摘出",notes:"非露出部3cm以上6cm未満：3230点"},
  {id:"f23",code:"K006",name:"皮膚悪性腫瘍切除術",points:13590,category:"手術",description:"皮膚悪性腫瘍（悪性黒色腫・基底細胞癌等）の切除",notes:"郭清術の有無・範囲により変動"},
  {id:"f24",code:"K007",name:"皮膚切開術",points:640,category:"手術",description:"膿瘍・炎症性粉瘤の切開排膿",notes:"長径10cm以上：1290点"},
  {id:"f25",code:"G010",name:"関節腔内注射",points:80,category:"注射",description:"ケロイド・円形脱毛症等への局所注射（ケナコルトA等）",notes:"薬剤料別途加算"},
  {id:"f26",code:"G000",name:"皮内・皮下注射",points:22,category:"注射",description:"皮内・皮下への注射",notes:"生物学的製剤の注射手技料として算定"},
  {id:"f27",code:"J054-2",name:"ナローバンドUVB療法",points:340,category:"皮膚科処置",description:"ナローバンドUVB光線療法（アトピー・乾癬・白斑等）",notes:"月10回まで算定可"},
  {id:"f28",code:"F000",name:"調剤料（内服薬・院内処方）",points:11,category:"投薬",description:"院内処方の調剤料（1日分）",notes:"院外処方の場合は処方箋料（68点）"},
  {id:"f29",code:"F400",name:"処方箋料（院外処方）",points:68,category:"投薬",description:"院外薬局への処方箋発行",notes:"一般名処方加算あり"},
];

export const billingTips = [
  {title:"外来管理加算は処置・検査と同日に算定不可",detail:"同日に処置（皮膚科軟膏処置等）・検査・注射・理学療法等を行った場合は外来管理加算を算定できない"},
  {title:"皮膚科レーザー療法（液体窒素）は2週間以上の間隔が必要",detail:"液体窒素凍結療法（J054）は同一病変に対して2週間以上の間隔が必要"},
  {title:"初診と再診の判断",detail:"同一疾患で継続治療中は再診。治癒後に同一疾患で再来院した場合または新たな疾患の場合は初診として算定する"},
  {title:"生物学的製剤の注射料と薬剤料",detail:"デュピクセント等の皮下注射は注射手技料（22点）と薬剤料の両方を算定する"},
  {title:"QuantiFERON（QFT）は生物学的製剤開始前に算定",detail:"結核スクリーニングとして開始前に算定。年1回算定可"},
  {title:"皮膚生検の算定",detail:"皮膚生検を行った場合、処置料に加えて病理診断料を別途算定する"},
];
