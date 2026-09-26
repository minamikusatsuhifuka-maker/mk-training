// スタッフ育成カルテ系APIの共通応答（指示書179・サーバー専用）
//
// 非許可・未ログイン・（スタッフ側は）フラグOFFのときは **すべて 404**（存在秘匿。169/173と同じ）。
// 前提リソース（テーブル・バケット）未作成は 503 で「何を作れば直るか」を名指しする（165）。

import { NextResponse } from "next/server";
import {
  GrowthBucketMissingError,
  GrowthTableMissingError,
  ServiceRoleMissingError,
} from "./staff-growth-server";

export const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export function growthErrorResponse(e: unknown): NextResponse {
  if (e instanceof GrowthTableMissingError) {
    return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  }
  if (e instanceof GrowthBucketMissingError) {
    return NextResponse.json({ error: e.message, bucketMissing: true }, { status: 503 });
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });
