// 文章からの取り込みAPI（指示書177）— **管理者のみ**（173と同じ権限・非許可は404）
//   POST ?action=extract（multipart: file）→ { text }
//        .txt / .md はそのまま、.docx / .pptx は既存の抽出処理（lib/library-extract.ts・AIを使わない）で文字にする。
//        PDF は対象外: 既存のPDF抽出はAI（Gemini）に原本を送る方式で、「AIに送る前に氏名を役割に置換する」（177-3）を守れないため。
//   POST（JSON: { text, periodId }）→ { proposals, candidates, stats, provider, model }
//        仕分けの提案を返すだけ。**記録は書かない**（保存は院長が採用したものを既存の /api/director-retrospective で）。
//
// 【匿名化（177-3）】AIに送る前に、登録済みスタッフの氏名を役割名に置換する（174と同じ名簿・buildNameReplacer）。
// 【原文を保存しない（177-3）】貼り付け・ファイルの本文はメモリ上で扱うだけ。DB・ストレージに書かない。
//   操作ログに残すのは文字数・区切り数・提案件数・AI の種類だけ（本文は残さない・173と同じ）。
// 【四象限（177-2-1）】AIの出力形式に配分・分類の欄は無い。含まれていても normalizeChunkResult で捨てる。
// 【AI基盤】175で統一した callAI（gemini-3.8-flash・既存キー）。新しいキー・環境変数は使わない。

import { NextResponse } from "next/server";
import {
  authorizeDirectorRetrospective,
  fetchAllRecords,
  loadStaffRoster,
  recordRetrospectiveLog,
  RetrospectiveTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/director-retrospective-server";
import { buildNameReplacer, periodRangeLabel } from "@/lib/director-retrospective";
import { callAI, getCurrentAiModel } from "@/lib/ai-provider";
import { extractOfficeText } from "@/lib/library-extract";
import { fileKind } from "@/lib/library";
import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_MAX,
  IMPORT_SYSTEM_PROMPT,
  buildImportUserPrompt,
  buildPeriodListForPrompt,
  mergeChunkOutcomes,
  normalizeChunkResult,
  parseJsonLoose,
  splitIntoChunks,
  type ChunkOutcome,
  type ImportResult,
} from "@/lib/retro-import";

export const runtime = "nodejs";
// 長い文章は区切って複数回AIを呼ぶため長めに取る
export const maxDuration = 300;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

/** 同時に解析する区切りの数 */
const CONCURRENCY = 3;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof RetrospectiveTableMissingError) {
    return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

async function extract(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }
  const name = file.name || "";
  if (file.size === 0) return NextResponse.json({ error: "ファイルが空です" }, { status: 400 });
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    return NextResponse.json({ error: "ファイルが大きすぎます（5MBまで）" }, { status: 400 });
  }
  const lower = name.toLowerCase();
  const kind = fileKind(file.type || "", name);
  // 読み込んだ内容はメモリ上だけ。どこにも保存しない
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown") || file.type.startsWith("text/")) {
    text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
  } else if (kind === "word" || kind === "ppt") {
    const r = await extractOfficeText(buffer, file.type || "", name);
    if (!r.ok) {
      return NextResponse.json(
        { error: "文字を読み取れませんでした（古い .doc / .ppt は非対応です。文章をコピーして貼り付けてください）" },
        { status: 400 }
      );
    }
    text = r.text;
  } else if (kind === "pdf") {
    return NextResponse.json(
      {
        error:
          "PDFは読み込めません。PDFの文字はAIでしか読み取れず、氏名を役割に置き換える前の本文がAIに渡ってしまうためです。PDFの文章をコピーして貼り付けてください",
      },
      { status: 400 }
    );
  } else {
    return NextResponse.json({ error: "対応していない形式です（.txt / .md / .docx / .pptx）" }, { status: 400 });
  }
  text = text.replace(/\r\n?/g, "\n").trim();
  if (!text) return NextResponse.json({ error: "文字がありませんでした" }, { status: 400 });
  return NextResponse.json({ text });
}

export async function POST(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();

  if (new URL(req.url).searchParams.get("action") === "extract") return extract(req);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) return NextResponse.json({ error: "文章を貼り付けてください" }, { status: 400 });
  if (text.length > IMPORT_MAX) {
    return NextResponse.json(
      { error: `一度に取り込めるのは${IMPORT_MAX.toLocaleString()}文字までです（現在${text.length.toLocaleString()}文字）。分けて取り込んでください` },
      { status: 400 }
    );
  }
  const periodIdRaw = typeof body.periodId === "string" ? body.periodId : "";

  try {
    const { data, tableMissing } = await fetchAllRecords(auth.admin);
    if (tableMissing) throw new RetrospectiveTableMissingError();
    const forced = periodIdRaw ? data.periods.find((p) => p.id === periodIdRaw) ?? null : null;
    if (periodIdRaw && !forced) {
      return NextResponse.json({ error: "指定した期が見つかりません" }, { status: 400 });
    }

    // 送信前の匿名化（177-3）: 本文・期の名称とも
    const replacer = buildNameReplacer(await loadStaffRoster(auth.admin));
    const anonymized = replacer(text);
    const chunks = splitIntoChunks(anonymized);
    const periodList = buildPeriodListForPrompt(data.periods, replacer);
    const forcedPeriod = forced
      ? { id: forced.id, label: `${replacer(forced.name)}（${periodRangeLabel(forced) || "期間未設定"}）` }
      : null;
    const periodIds = new Set(data.periods.map((p) => p.id));
    const { provider, model } = await getCurrentAiModel();

    const analyzeChunk = async (index: number): Promise<ChunkOutcome | null> => {
      const user = buildImportUserPrompt({
        periodList,
        forcedPeriod,
        chunk: chunks[index],
        index,
        total: chunks.length,
      });
      // 通信・読み取りの失敗は1回だけやり直す
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await callAI({
          system: IMPORT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: user }],
          maxTokens: 16384,
          json: true,
        });
        if (!res.ok) continue;
        const parsed = parseJsonLoose(res.text);
        if (!parsed || typeof parsed !== "object") continue;
        return normalizeChunkResult(parsed, {
          source: chunks[index],
          index,
          periodIds,
          forcedPeriodId: forced ? forced.id : null,
        });
      }
      return null;
    };

    const outcomes: { index: number; outcome: ChunkOutcome }[] = [];
    const failed: number[] = [];
    for (let start = 0; start < chunks.length; start += CONCURRENCY) {
      const batch = chunks.slice(start, start + CONCURRENCY).map((_, k) => start + k);
      const results = await Promise.all(batch.map((i) => analyzeChunk(i)));
      results.forEach((r, k) => {
        if (r) outcomes.push({ index: batch[k], outcome: r });
        else failed.push(batch[k] + 1);
      });
    }

    const by = auth.userEmail || auth.userId;
    const log = async (result: string, proposals: number) =>
      recordRetrospectiveLog(auth.admin, {
        by,
        action: "取り込み解析",
        kind: "文章からの取り込み",
        target: "",
        changes: [
          { field: "文字数", before: "", after: `${text.length}字（区切り${chunks.length}）` },
          { field: "期", before: "", after: forced ? "指定" : "AIに判定させる" },
          { field: "結果", before: "", after: result },
          { field: "提案", before: "", after: `${proposals}件` },
          { field: "AI", before: "", after: `${provider} / ${model}` },
        ],
      });

    if (outcomes.length === 0) {
      await log("失敗", 0);
      return NextResponse.json(
        { error: "AIの解析に失敗しました。時間をおいて「仕分ける」をもう一度押してください（入力はそのまま残っています）" },
        { status: 502 }
      );
    }

    const merged = mergeChunkOutcomes(outcomes, chunks.length, failed.sort((a, b) => a - b));
    await log(failed.length > 0 ? `一部失敗（区切り${failed.join("・")}）` : "成功", merged.proposals.length);
    const result: ImportResult = { ...merged, provider, model };
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
