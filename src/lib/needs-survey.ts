// 選択理論「5つの基本的欲求サーベイ」の共有（指示書58）
// 数値は staff_profile:<userId> の needsSurvey に保存（専用テーブルなし）。
// 画像は Storage staff-photos の {userId}/survey/ 配下。
// 数値は「相互理解のための共有」が目的であり、評価・優劣付けには使わない。

// ─── 5欲求 ───
export const NEED_KEYS = [
  "survival",
  "belonging",
  "power",
  "freedom",
  "fun",
] as const;

export type NeedKey = (typeof NEED_KEYS)[number];

export const NEED_LABELS: Record<NeedKey, string> = {
  survival: "生存",
  belonging: "愛・所属",
  power: "力",
  freedom: "自由",
  fun: "楽しみ",
};

// ─── 詳細15項目（欲求内訳） ───
export type NeedDetailItem = {
  key: string;
  label: string;
  need: NeedKey;
};

export const NEED_DETAIL_ITEMS: NeedDetailItem[] = [
  { key: "safety", label: "安全・安定", need: "survival" },
  { key: "health", label: "健康", need: "survival" },
  { key: "love", label: "愛", need: "belonging" },
  { key: "belong", label: "所属", need: "belonging" },
  { key: "achievement", label: "達成", need: "power" },
  { key: "approval", label: "承認", need: "power" },
  { key: "contribution", label: "貢献", need: "power" },
  { key: "competition", label: "競争", need: "power" },
  { key: "release", label: "解放", need: "freedom" },
  { key: "change", label: "変化", need: "freedom" },
  { key: "individuality", label: "自分らしさ", need: "freedom" },
  { key: "humor", label: "ユーモア", need: "fun" },
  { key: "curiosity", label: "好奇心", need: "fun" },
  { key: "learning", label: "学習・成長", need: "fun" },
  { key: "creativity", label: "創造性", need: "fun" },
];

// 詳細の3値: 欲求（本来の高さ）／注力（時間・エネルギー）／現況（満たされ度）
export type NeedDetailValues = {
  desire?: number;
  focus?: number;
  current?: number;
};

export const DETAIL_VALUE_LABELS: { key: keyof NeedDetailValues; label: string }[] =
  [
    { key: "desire", label: "欲求" },
    { key: "focus", label: "注力" },
    { key: "current", label: "現況" },
  ];

// ─── プロフィール内の保存形 ───
export type NeedsSurvey = {
  imageUrl?: string;
  /** 5欲求の代表値（0-100） */
  values?: Partial<Record<NeedKey, number>>;
  /** 詳細15項目（任意） */
  details?: Record<string, NeedDetailValues>;
  /** 既定 private（自分のみ）。public でメンバー紹介に公開 */
  visibility: "private" | "public";
  updatedAt: string;
};

// 0-100 に丸める（不正値は undefined）
export function clampNeedValue(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || isNaN(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// 保存・受信データの正規化（不正キーは捨てる）
export function normalizeNeedsSurvey(raw: unknown): {
  values: Partial<Record<NeedKey, number>>;
  details: Record<string, NeedDetailValues>;
  visibility: "private" | "public";
} {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const values: Partial<Record<NeedKey, number>> = {};
  if (o.values && typeof o.values === "object") {
    for (const k of NEED_KEYS) {
      const v = clampNeedValue((o.values as Record<string, unknown>)[k]);
      if (v !== undefined) values[k] = v;
    }
  }
  const details: Record<string, NeedDetailValues> = {};
  if (o.details && typeof o.details === "object") {
    for (const item of NEED_DETAIL_ITEMS) {
      const d = (o.details as Record<string, unknown>)[item.key];
      if (!d || typeof d !== "object") continue;
      const row: NeedDetailValues = {};
      const dd = d as Record<string, unknown>;
      const desire = clampNeedValue(dd.desire);
      const focus = clampNeedValue(dd.focus);
      const current = clampNeedValue(dd.current);
      if (desire !== undefined) row.desire = desire;
      if (focus !== undefined) row.focus = focus;
      if (current !== undefined) row.current = current;
      if (Object.keys(row).length > 0) details[item.key] = row;
    }
  }
  return {
    values,
    details,
    visibility: o.visibility === "public" ? "public" : "private",
  };
}

// レーダーチャートに使う5欲求値: values があればそれ、無ければ詳細の「欲求」平均で補完
export function radarValuesOf(
  survey: Pick<NeedsSurvey, "values" | "details"> | undefined | null
): Partial<Record<NeedKey, number>> {
  if (!survey) return {};
  const out: Partial<Record<NeedKey, number>> = { ...(survey.values ?? {}) };
  for (const need of NEED_KEYS) {
    if (out[need] !== undefined) continue;
    const items = NEED_DETAIL_ITEMS.filter((i) => i.need === need);
    const nums = items
      .map((i) => survey.details?.[i.key]?.desire)
      .filter((v): v is number => typeof v === "number");
    if (nums.length > 0) {
      out[need] = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    }
  }
  return out;
}

// 表示可能なサーベイか（公開設定かつ何かしら中身がある）
export function hasSurveyContent(
  survey: NeedsSurvey | undefined | null
): boolean {
  if (!survey) return false;
  return (
    !!survey.imageUrl ||
    Object.keys(survey.values ?? {}).length > 0 ||
    Object.keys(survey.details ?? {}).length > 0
  );
}
