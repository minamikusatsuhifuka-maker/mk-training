// クリニックの歩み — 型と純粋関数（指示書196で clinic-metrics.ts から切り出し）
// サーバー（/api/admin/clinic-metrics-import）からも使うため、"use client" のモジュールを import しないこと。
// 画面側は従来どおり clinic-metrics.ts から import する（再エクスポートしている）。

export const PORTAL_METRICS_KEY = "portal_metrics";

// 売上は万円の整数。insurance=保険売上・selfPay=自費売上（施術＋物販）。
// counseling=カウンセリング件数。すべて欠測（null）許容。
// sales は旧80データの後方互換（内訳なしの合算）。内訳（insurance/selfPay）があれば正規化で null 化する。
// 合算は保存せず表示時に計算する（二重管理しない）。
export type MonthMetric = {
  ym: string; // "YYYY-MM"
  insurance: number | null;
  selfPay: number | null;
  counseling: number | null;
  sales?: number | null; // 旧データ互換（内訳未入力の合算のみ）
};

export type Initiative = {
  id: string;
  date: string; // "YYYY-MM-DD"（開始日）
  endDate?: string; // "YYYY-MM-DD"（任意・期間つき施策の終了日。date<=endDate）
  label: string;
};

export type ClinicMetrics = {
  months: MonthMetric[];
  initiatives: Initiative[];
  /** 198: 年度の始まりの月（1〜12・既定6＝開業月に合わせる）。未設定は既定扱い */
  fiscalStartMonth?: number;
  updatedAt: string;
};

/** 198: 年度の始まりの月の既定（6月＝開業月） */
export const DEFAULT_FISCAL_START_MONTH = 6;

/** グラフの配色（「月の推移」と「年度で比べる」で同じ色を使う・198-D） */
export const METRIC_COLOR = {
  insurance: "#14b8a6", // teal-500（保険）
  selfPay: "#c026d3", // fuchsia-600（自費・指示書94）
  legacy: "#94a3b8", // slate-400（旧データ・内訳未入力）
  total: "#475569", // slate-600（合算）
  counseling: "#0ea5e9", // sky-500（カウンセリング）
} as const;

/** 198-D: 数値の出所（画面に常時出す注記） */
export const METRICS_SOURCE_NOTE =
  "保険売上＝保険点数×10円、自費売上＝施術＋物販（経営数値把握表）";

const YM_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyClinicMetrics(): ClinicMetrics {
  return { months: [], initiatives: [], updatedAt: "" };
}

/** 年度の始まりの月（未設定・不正は既定の6月） */
export function fiscalStartMonthOf(data: ClinicMetrics): number {
  const m = data.fiscalStartMonth;
  return typeof m === "number" && m >= 1 && m <= 12 ? m : DEFAULT_FISCAL_START_MONTH;
}

export function genInitiativeId(): string {
  return `init-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// null | 数値へ正規化（空文字・NaN・負値は null 扱い、整数へ丸め）
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// 施策の date（"YYYY-MM-DD"）→ 月キー "YYYY-MM"
export function initiativeYm(date: string): string {
  return date.slice(0, 7);
}

// "2026-07" → { year:"26", month:"7" }（軸ラベル用）
export function shortYm(ym: string): { year: string; month: string } {
  if (!YM_RE.test(ym)) return { year: "", month: ym };
  const [y, mo] = ym.split("-");
  return { year: y.slice(2), month: String(Number(mo)) };
}

// ─── 合算・内訳のヘルパ（合算は保存せず表示時に計算） ───

// 保険・自費のいずれかが入力済みか（内訳あり）
export function hasBreakdown(m: MonthMetric): boolean {
  return m.insurance != null || m.selfPay != null;
}

// 内訳なしの旧データ（合算のみ）か
export function isLegacyOnly(m: MonthMetric): boolean {
  return !hasBreakdown(m) && m.sales != null;
}

// 合算（棒の高さ）。内訳ありは保険＋自費、旧データは sales、どちらも無ければ null。
export function monthTotal(m: MonthMetric): number | null {
  if (hasBreakdown(m)) return (m.insurance ?? 0) + (m.selfPay ?? 0);
  if (m.sales != null) return m.sales;
  return null;
}

// 施策の期間ラベル "2026/3/1〜5/31"（単日は "2026/7/15"）
export function formatInitiative(i: Initiative): string {
  const f = (d: string) => {
    const [y, m, dd] = d.split("-");
    return `${y}/${Number(m)}/${Number(dd)}`;
  };
  return i.endDate ? `${f(i.date)}〜${f(i.endDate)}` : f(i.date);
}

// ─── 正規化（読み書き両境界で通す） ───

export function normalizeClinicMetrics(raw: unknown): ClinicMetrics {
  const o = (raw ?? {}) as Record<string, unknown>;

  // months: ym検証・数値化・重複年月は後勝ちで排除・ym昇順
  const byYm = new Map<string, MonthMetric>();
  if (Array.isArray(o.months)) {
    for (const r of o.months as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const ym = typeof r.ym === "string" ? r.ym : "";
      if (!YM_RE.test(ym)) continue;
      const insurance = toNumOrNull(r.insurance);
      const selfPay = toNumOrNull(r.selfPay);
      const counseling = toNumOrNull(r.counseling);
      // 旧80データ互換: sales は内訳が無いときだけ残す（二重管理しない）
      let sales = toNumOrNull(r.sales);
      if (insurance != null || selfPay != null) sales = null;
      const month: MonthMetric = { ym, insurance, selfPay, counseling };
      if (sales != null) month.sales = sales;
      byYm.set(ym, month);
    }
  }
  const months = Array.from(byYm.values()).sort((a, b) =>
    a.ym.localeCompare(b.ym)
  );

  // initiatives: 日付検証・ラベル必須・endDate任意（date<=endDate違反は破棄）・id補完・日付昇順
  const initiatives: Initiative[] = [];
  if (Array.isArray(o.initiatives)) {
    for (const r of o.initiatives as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const date = typeof r.date === "string" ? r.date : "";
      const label = typeof r.label === "string" ? r.label.trim() : "";
      if (!DATE_RE.test(date) || !label) continue;
      let endDate =
        typeof r.endDate === "string" && DATE_RE.test(r.endDate)
          ? r.endDate
          : undefined;
      if (endDate && endDate < date) endDate = undefined; // date<=endDate を検証
      initiatives.push({
        id: typeof r.id === "string" && r.id ? r.id : genInitiativeId(),
        date,
        label,
        ...(endDate ? { endDate } : {}),
      });
    }
  }
  initiatives.sort((a, b) => a.date.localeCompare(b.date));

  // 198: 年度の始まりの月（1〜12以外・未設定は持たせない＝既定6月に倒れる）
  const fs = toNumOrNull(o.fiscalStartMonth);
  const fiscalStartMonth = fs != null && fs >= 1 && fs <= 12 ? fs : undefined;

  return {
    months,
    initiatives,
    ...(fiscalStartMonth ? { fiscalStartMonth } : {}),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

// ─── 表示用ヘルパ ───

/** 軸の上限をきりのよい数に（グラフ共通・198で「月の推移」と年度比較が共有） */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// 表示する月軸 = months と initiatives（開始月・終了月）の和集合を昇順に。
// 施策だけで数値未入力の月・期間施策の終端月も列として出せる（欠測はグラフ側でスキップ）。
export function buildAxisYms(data: ClinicMetrics): string[] {
  const set = new Set<string>();
  for (const m of data.months) set.add(m.ym);
  for (const i of data.initiatives) {
    const s = initiativeYm(i.date);
    if (YM_RE.test(s)) set.add(s);
    if (i.endDate) {
      const e = initiativeYm(i.endDate);
      if (YM_RE.test(e)) set.add(e);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// ─── 12か月移動平均（指示書93・整形層に集約。表示期間に依存しない全データ基準） ───

function ymToIndex(ym: string): number {
  const [y, mo] = ym.split("-").map(Number);
  return y * 12 + (mo - 1);
}
function indexToYm(idx: number): string {
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * 合算売上（保険＋自費／旧データは sales）の12か月 trailing 移動平均を全データ基準で計算する。
 * - その月を含む過去12暦月の窓で、値がある月だけを母数に平均（完全欠測月は母数から除外）。
 * - データ開始から12か月未満の月は「ある分の平均」を返し、開業月から線が途切れないようにする。
 * - 返却は ym → 平均値（万円）の Map。データ月の範囲 [最初,最後] の全暦月に値を持つ。
 */
export function computeMovingAvg12(data: ClinicMetrics): Map<string, number> {
  const totalByYm = new Map<string, number>();
  for (const m of data.months) {
    const t = monthTotal(m);
    if (t != null) totalByYm.set(m.ym, t);
  }
  const result = new Map<string, number>();
  if (totalByYm.size === 0) return result;

  const indices = Array.from(totalByYm.keys())
    .filter((ym) => YM_RE.test(ym))
    .map(ymToIndex)
    .sort((a, b) => a - b);
  const firstIdx = indices[0];
  const lastIdx = indices[indices.length - 1];

  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    let sum = 0;
    let count = 0;
    for (let w = idx - 11; w <= idx; w++) {
      const v = totalByYm.get(indexToYm(w));
      if (v != null) {
        sum += v;
        count++;
      }
    }
    if (count > 0) result.set(indexToYm(idx), sum / count);
  }
  return result;
}

// ─── 年度（指示書198）───
//
// 年度は「始まりの年」で呼ぶ: 2022年度 = 2022年6月〜2023年5月（既定・開業月に合わせる）。
// 始まりの月は院長が変更できる（fiscalStartMonth）。ここは純粋関数だけを置き、
// 表示（色・太さ・並び）は画面側に任せる。

export type FiscalMonthPoint = {
  ym: string;
  /** 年度内の位置（0=年度の最初の月 … 11） */
  offset: number;
  /** 実際の月（6, 7, … 5） */
  month: number;
  insurance: number | null;
  selfPay: number | null;
  /** 合計（内訳が無い旧データは sales） */
  total: number | null;
};

export type FiscalYearSummary = {
  /** 年度の始まりの年（2022年度 → 2022） */
  year: number;
  label: string; // "2022年度"
  rangeLabel: string; // "2022年6月〜2023年5月"
  insurance: number;
  selfPay: number;
  /** 内訳なしの旧データの合算（insurance/selfPay には入らない） */
  legacy: number;
  total: number;
  /** 売上のある月数 */
  monthCount: number;
  /** 12か月そろっているか */
  complete: boolean;
  /** 自費の割合（合計が0なら null） */
  selfPayRatio: number | null;
  /** 前年度比（1.07 = 107%）。同じ月どうしでそろわなければ null */
  yoy: number | null;
  /** 前年度比に使った月数 */
  yoyMonths: number;
  /** 年度内の12か月（offset順・データの無い月は null） */
  points: (FiscalMonthPoint | null)[];
};

/** その年月が属する年度（＝始まりの年） */
export function fiscalYearOf(ym: string, startMonth: number): number {
  const [y, mo] = ym.split("-").map(Number);
  return mo >= startMonth ? y : y - 1;
}

/** 年度内の位置（0〜11） */
export function fiscalOffset(ym: string, startMonth: number): number {
  const mo = Number(ym.split("-")[1]);
  return (mo - startMonth + 12) % 12;
}

/** 年度の月の並び（例: 始まり6月 → [6,7,8,9,10,11,12,1,2,3,4,5]） */
export function fiscalMonthSequence(startMonth: number): number[] {
  return Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1);
}

export function fiscalLabel(year: number): string {
  return `${year}年度`;
}

/** "2022年6月〜2023年5月"（1月始まりなら同じ年の1月〜12月） */
export function fiscalRangeLabel(year: number, startMonth: number): string {
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? year : year + 1;
  return `${year}年${startMonth}月〜${endYear}年${endMonth}月`;
}

/** offset → "YYYY-MM" */
function ymOfOffset(year: number, startMonth: number, offset: number): string {
  const total = startMonth - 1 + offset;
  const y = year + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * 年度ごとの集計（古い順）。
 * - 合計・保険・自費は「売上のある月」だけを足す（欠測は0として扱わない）。
 * - 前年度比は**前年度の同じ月どうし**で比べる（12か月に満たない年度も同じ期間で比較）。
 *   前年度にその月がそろっていなければ null（画面では「―」）。
 */
export function buildFiscalYears(
  data: ClinicMetrics,
  startMonth: number = fiscalStartMonthOf(data)
): FiscalYearSummary[] {
  const byYear = new Map<number, Map<number, FiscalMonthPoint>>();
  for (const m of data.months) {
    if (!YM_RE.test(m.ym)) continue;
    const total = monthTotal(m);
    if (total == null) continue; // 売上の無い月は年度の集計に入れない
    const year = fiscalYearOf(m.ym, startMonth);
    const offset = fiscalOffset(m.ym, startMonth);
    const bucket = byYear.get(year) ?? new Map<number, FiscalMonthPoint>();
    bucket.set(offset, {
      ym: m.ym,
      offset,
      month: Number(m.ym.split("-")[1]),
      insurance: hasBreakdown(m) ? m.insurance : null,
      selfPay: hasBreakdown(m) ? m.selfPay : null,
      total,
    });
    byYear.set(year, bucket);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  const summaries: FiscalYearSummary[] = [];

  for (const year of years) {
    const bucket = byYear.get(year)!;
    const points: (FiscalMonthPoint | null)[] = Array.from(
      { length: 12 },
      (_, i) => bucket.get(i) ?? null
    );
    let insurance = 0;
    let selfPay = 0;
    let legacy = 0;
    let total = 0;
    let monthCount = 0;
    for (const p of points) {
      if (!p) continue;
      monthCount++;
      total += p.total ?? 0;
      if (p.insurance == null && p.selfPay == null) legacy += p.total ?? 0;
      else {
        insurance += p.insurance ?? 0;
        selfPay += p.selfPay ?? 0;
      }
    }

    // 前年度比: この年度に値のある月と同じ月が、前年度にもすべてそろっているときだけ
    const prev = byYear.get(year - 1);
    let yoy: number | null = null;
    let yoyMonths = 0;
    if (prev && monthCount > 0) {
      let prevSum = 0;
      let ok = true;
      for (const p of points) {
        if (!p) continue;
        const q = prev.get(p.offset);
        if (!q) {
          ok = false;
          break;
        }
        prevSum += q.total ?? 0;
        yoyMonths++;
      }
      if (ok && prevSum > 0) yoy = total / prevSum;
      else {
        yoy = null;
        yoyMonths = 0;
      }
    }

    summaries.push({
      year,
      label: fiscalLabel(year),
      rangeLabel: fiscalRangeLabel(year, startMonth),
      insurance,
      selfPay,
      legacy,
      total,
      monthCount,
      complete: monthCount === 12,
      selfPayRatio: total > 0 ? selfPay / total : null,
      yoy,
      yoyMonths,
      points,
    });
  }
  return summaries;
}

/** 年度の最初の月の "YYYY-MM"（表示の補助） */
export function fiscalFirstYm(year: number, startMonth: number): string {
  return ymOfOffset(year, startMonth, 0);
}

// ─── 月ごとの比較（指示書198-補）───
//
// 2つの年度を同じ月どうしで並べ、各月の差を出す。
// 合計は**両方の年度にデータがある月だけ**を足す（月数をそろえる）。

/** 比べる値（グラフの切り替えと同じ） */
export type FiscalMetric = "total" | "insurance" | "selfPay";

export type FiscalDiffRow = {
  offset: number;
  /** 実際の月（6, 7, … 5） */
  month: number;
  /** 基準の年度の値（未集計は null） */
  base: number | null;
  /** 比べる年度の値（未集計は null） */
  target: number | null;
  /** 比べる年度 − 基準の年度（両方そろう月だけ） */
  diff: number | null;
  /** 増減率（基準が0・片方が未集計なら null） */
  ratio: number | null;
};

export type FiscalDiffTable = {
  rows: FiscalDiffRow[]; // 12件（年度の月順）
  /** 両方にデータがある月だけの合計 */
  baseTotal: number;
  targetTotal: number;
  diff: number;
  ratio: number | null;
  /** 合計に使った月（実際の月番号・年度の月順） */
  commonMonths: number[];
  /** 合計行の注記（例: "6〜8月の3か月で比較"） */
  noteLabel: string;
};

function metricValue(
  p: FiscalMonthPoint | null,
  metric: FiscalMetric
): number | null {
  if (!p) return null;
  if (metric === "total") return p.total;
  return metric === "insurance" ? p.insurance : p.selfPay;
}

export function buildFiscalDiff(
  base: FiscalYearSummary | null,
  target: FiscalYearSummary | null,
  metric: FiscalMetric,
  startMonth: number
): FiscalDiffTable {
  const months = fiscalMonthSequence(startMonth);
  const rows: FiscalDiffRow[] = [];
  const commonOffsets: number[] = [];
  let baseTotal = 0;
  let targetTotal = 0;

  for (let offset = 0; offset < 12; offset++) {
    const b = metricValue(base?.points[offset] ?? null, metric);
    const t = metricValue(target?.points[offset] ?? null, metric);
    const both = b != null && t != null;
    if (both) {
      commonOffsets.push(offset);
      baseTotal += b;
      targetTotal += t;
    }
    rows.push({
      offset,
      month: months[offset],
      base: b,
      target: t,
      diff: both ? t - b : null,
      ratio: both && b !== 0 ? (t - b) / b : null,
    });
  }

  const commonMonths = commonOffsets.map((o) => months[o]);
  const n = commonOffsets.length;
  let noteLabel: string;
  if (n === 0) noteLabel = "比べられる月がありません";
  else if (n === 1) noteLabel = `${commonMonths[0]}月の1か月で比較`;
  else if (commonOffsets[n - 1] - commonOffsets[0] === n - 1)
    noteLabel = `${commonMonths[0]}〜${commonMonths[n - 1]}月の${n}か月で比較`;
  else noteLabel = `${n}か月で比較（両方そろっている月のみ）`;

  return {
    rows,
    baseTotal,
    targetTotal,
    diff: targetTotal - baseTotal,
    ratio: n > 0 && baseTotal !== 0 ? (targetTotal - baseTotal) / baseTotal : null,
    commonMonths,
    noteLabel,
  };
}
