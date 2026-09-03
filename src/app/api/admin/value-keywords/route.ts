// 価値観キーワードの一覧 管理API（指示書172）— **管理者のみ**
//
// 【置き場所を /api/admin にした理由】
// proxy.ts が /api/admin 配下を「管理者以外には存在しないAPIと同じ応答」にしている（159-D）。
// このルート自身でも requireAdmin で管理者判定をやり直す（関門が万一無効化されても素通りさせない）。
//
// GET: 現在の一覧（未保存なら既定52語）＋ 語ごとの「選択中の人数」（削除前の注意表示。172-3-1）
// PUT: 一覧の保存。lib/value-keywords-server.ts が設定の保存と操作ログの追記を対で行う。
//      body: { words: [{id,label}], min, max, resetToDefault? }
//      - 既存の語は id を変えずに label だけ直す（172-3-2）
//      - 追加の語は id を新規発行して送る（クライアントの newValueKeywordId）
//      - 一覧から外した語はサーバーが retired に退避する（選択済みの人の表示は消えない）

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadValueKeywordUsage,
  loadValueKeywordsConfigServer,
  saveValueKeywordsConfigWithLog,
  ValueKeywordsSaveError,
} from "@/lib/value-keywords-server";
import {
  VALUE_KEYWORDS_LIMIT_MAX,
  VALUE_KEYWORDS_LIMIT_MIN,
  VALUE_KEYWORDS_WORDS_MAX,
  cleanValueKeywordLabel,
  isValidValueKeywordId,
  type ValueKeywordDef,
} from "@/lib/value-keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const [config, usage] = await Promise.all([
    loadValueKeywordsConfigServer(),
    loadValueKeywordUsage(),
  ]);
  return NextResponse.json({ config, usage });
}

function parseLimit(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < VALUE_KEYWORDS_LIMIT_MIN || v > VALUE_KEYWORDS_LIMIT_MAX) return null;
  return v;
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  let body: {
    words?: unknown;
    min?: unknown;
    max?: unknown;
    resetToDefault?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400 });
  }

  if (!Array.isArray(body.words) || body.words.length === 0) {
    return NextResponse.json(
      { error: "語を1つ以上残してください" },
      { status: 400 }
    );
  }
  if (body.words.length > VALUE_KEYWORDS_WORDS_MAX) {
    return NextResponse.json(
      { error: `語は${VALUE_KEYWORDS_WORDS_MAX}個までです` },
      { status: 400 }
    );
  }
  const words: ValueKeywordDef[] = [];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  for (const item of body.words) {
    const g = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    if (!isValidValueKeywordId(g.id)) {
      return NextResponse.json({ error: "語の識別子が不正です" }, { status: 400 });
    }
    const label = cleanValueKeywordLabel(g.label);
    if (!label) {
      return NextResponse.json(
        { error: "表記が空の語があります" },
        { status: 400 }
      );
    }
    if (seenIds.has(g.id)) {
      return NextResponse.json({ error: "語の識別子が重複しています" }, { status: 400 });
    }
    if (seenLabels.has(label)) {
      return NextResponse.json(
        { error: `同じ表記の語が2つあります: ${label}` },
        { status: 400 }
      );
    }
    seenIds.add(g.id);
    seenLabels.add(label);
    words.push({ id: g.id, label });
  }

  const min = parseLimit(body.min);
  const max = parseLimit(body.max);
  if (min === null || max === null || min > max) {
    return NextResponse.json(
      {
        error: `選べる個数は${VALUE_KEYWORDS_LIMIT_MIN}〜${VALUE_KEYWORDS_LIMIT_MAX}の整数で、下限は上限以下にしてください`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await saveValueKeywordsConfigWithLog({
      words,
      min,
      max,
      actor: auth.user.email ?? auth.user.id,
      resetToDefault: body.resetToDefault === true,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValueKeywordsSaveError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
}
