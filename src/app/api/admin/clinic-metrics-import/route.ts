// クリニックの歩み — CSV 一括取り込み API（指示書196）— **管理者のみ**
//
// proxy.ts が /api/admin 配下を管理者以外には「存在しないAPI」と同じ応答にしている（159-D）。
// 委任の対応表（admin-items.ts）にも載せていないので、委任された幹部も呼べない（院長のみ）。
// このルート自身でも requireAdmin で判定をやり直す（関門が万一無効化されても素通りさせない）。
//
// GET : 取り込みの操作ログ（誰が・いつ・何件）
// POST: body { csv: string, dryRun?: boolean }
//       - dryRun=true  … プレビューだけ返す（保存しない）
//       - dryRun=false … エラーのない行を ym キーでマージして保存し、件数を返す
//       CSV の解釈と差分はサーバー側でやり直す（クライアントのプレビュー結果は信用しない）。

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseMetricsCsv } from "@/lib/clinic-metrics-import";
import {
  ClinicMetricsImportError,
  fetchClinicMetricsImportLogs,
  importClinicMetricsWithLog,
  previewClinicMetricsImport,
} from "@/lib/clinic-metrics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const logs = await fetchClinicMetricsImportLogs();
  return NextResponse.json({ logs: logs.slice(0, 10) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  let body: { csv?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400 });
  }
  if (typeof body.csv !== "string") {
    return NextResponse.json({ error: "CSVを貼り付けてください" }, { status: 400 });
  }

  const parsed = parseMetricsCsv(body.csv);
  if (parsed.fileError) {
    return NextResponse.json({ error: parsed.fileError }, { status: 400 });
  }

  if (body.dryRun === true) {
    const preview = await previewClinicMetricsImport(parsed);
    return NextResponse.json({ preview });
  }

  try {
    const result = await importClinicMetricsWithLog({
      parsed,
      actor: auth.user.email ?? auth.user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ClinicMetricsImportError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取り込みに失敗しました" },
      { status: 500 }
    );
  }
}
