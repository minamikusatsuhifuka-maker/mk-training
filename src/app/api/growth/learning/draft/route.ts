// 学びの記録のAI下書き（指示書179 B-3）
//   POST multipart { file } → 画像から講座名・開催日・場所を読み取り、講座マスタの候補を返す
//
// 【絶対条件】
//   ・このAPIは **提案を返すだけ**。データベースにもストレージにも一切書かない（150と同じ）。
//     保存は本人が確認したうえで既存の POST /api/growth/learning ＋ 証跡API を通す。
//   ・**設定でONのときだけ動く**（既定OFF）。B-3の前提「AIのAPIが有料枠で、送信内容が学習に
//     使われない契約であること」はコードからは確かめられないため、院長が契約を確認したうえで
//     管理画面（講座マスタ）から明示的にONにする。OFFのときは 404（機能の存在も伏せる）。
//   ・モデルは175の基盤（gemini-3.8-flash・callGeminiParts）。新しいキー・課金は使わない。
//   ・FACT_GUARD: 画像に書かれていないことは出させない。読み取れない項目は空。

import { NextResponse } from "next/server";
import { callGeminiParts } from "@/lib/ai-provider";
import { authorizeGrowth, fetchCourses, fetchGrowthConfig } from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import {
  COURSE_CATEGORIES,
  COURSE_NAME_MAX,
  ORGANIZER_MAX,
  VENUE_NAME_MAX,
  expandDateRange,
  isCourseCategory,
  isVenueType,
  normalizeDates,
  suggestCourses,
  ymd,
  type Course,
  type CourseCategory,
  type VenueType,
} from "@/lib/staff-growth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

export type LearningDraft = {
  courseName: string;
  organizer: string;
  category: CourseCategory | "";
  startDate: string;
  endDate: string;
  /** 180: 参加日の一覧（日程が読み取れたぶん。連続なら期間を展開） */
  dates: string[];
  venueType: VenueType | "";
  venueName: string;
  /** 講座マスタの候補（同名→部分一致の順） */
  candidates: Course[];
  note: string;
};

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    /* fallthrough */
  }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      const v = JSON.parse(cleaned.slice(s, e + 1));
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const SYSTEM = `あなたはクリニックスタッフの「学びの記録」の下書きを作る補助です。受講証・修了証・セミナーの案内・手書きメモなどの画像を読み、JSONだけを返します。

【最重要ルール（違反禁止）】
- 画像に書かれていないことは絶対に書かない。推測・一般論・創作をしない。
- 読み取れない項目は空文字 "" にする。埋めようとしないこと。
- 日付は YYYY-MM-DD。年が読み取れないときは空文字にする。
- 参加日が複数ある（例: 9月2日〜4日の3日間、9月2日と9日）ときは dates に**すべての日付**を並べる。1日だけなら1つ。
- 区分は次のどれかの値だけ: ${COURSE_CATEGORIES.map((c) => `${c.value}（${c.label}）`).join("、")}。判断できなければ空文字。
- 場所の種類は inhouse（院内）／venue（会場）／online（オンライン）のどれか。判断できなければ空文字。

【出力JSON（この形だけを返す）】
{
  "courseName": "講座・セミナー・学会の名称",
  "organizer": "主催（学会名・企業名など）",
  "category": "inhouse|conference|external|online|\\"\\"",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD（1日なら startDate と同じ、無ければ空文字）",
  "dates": ["YYYY-MM-DD", "..."],
  "venueType": "inhouse|venue|online|\\"\\"",
  "venueName": "会場名（オンラインならサービス名）"
}`;

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();

  // 既定OFF。院長が契約（有料枠・学習に使われない）を確認してONにしたときだけ動く
  const cfg = await fetchGrowthConfig(auth.admin);
  if (!cfg.aiDraftEnabled) return hidden();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("不正なリクエストです");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("画像ファイルがありません");
  if (!file.type.startsWith("image/")) return badRequest("画像ファイルのみ読み取れます");
  if (file.size === 0 || file.size > MAX_BYTES) return badRequest("画像が大きすぎます（10MBまで）");

  try {
    const { courses } = await fetchCourses(auth.admin);
    // メモリ上で読んで破棄（ストレージには書かない）
    let buffer: Buffer | null = Buffer.from(await file.arrayBuffer());
    const res = await callGeminiParts({
      system: SYSTEM,
      parts: [
        { text: "この画像から学びの記録の下書きを作ってください。" },
        { inline_data: { mime_type: file.type, data: buffer.toString("base64") } },
      ],
      maxTokens: 2048,
      json: true,
    });
    buffer = null;

    const empty: LearningDraft = {
      courseName: "",
      organizer: "",
      category: "",
      startDate: "",
      endDate: "",
      dates: [],
      venueType: "",
      venueName: "",
      candidates: [],
      note: "",
    };
    if (!res.ok) {
      return NextResponse.json({
        draft: { ...empty, note: "AIの読み取りに失敗しました。手入力してください。" },
        saved: false,
      });
    }
    const obj = parseJsonLoose(res.text);
    if (!obj) {
      return NextResponse.json({
        draft: { ...empty, note: "AIの応答を読み取れませんでした。手入力してください。" },
        saved: false,
      });
    }
    const courseName = str(obj.courseName, COURSE_NAME_MAX);
    const startDate = ymd(obj.startDate);
    const endDate = ymd(obj.endDate);
    // 参加日の一覧: AIが並べた dates を優先し、無ければ開始〜終了を展開
    let dates = normalizeDates(obj.dates);
    if (dates.length === 0) dates = expandDateRange(startDate, endDate);
    const draft: LearningDraft = {
      courseName,
      organizer: str(obj.organizer, ORGANIZER_MAX),
      category: isCourseCategory(obj.category) ? obj.category : "",
      startDate: dates[0] ?? startDate,
      endDate: dates[dates.length - 1] ?? endDate,
      dates,
      venueType: isVenueType(obj.venueType) ? obj.venueType : "",
      venueName: str(obj.venueName, VENUE_NAME_MAX),
      candidates: suggestCourses(courses, courseName),
      note: courseName ? "" : "講座名を読み取れませんでした。手入力してください。",
    };
    // 保存は一切していない。返すのは下書きだけ
    return NextResponse.json({ draft, saved: false, model: res.model });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
