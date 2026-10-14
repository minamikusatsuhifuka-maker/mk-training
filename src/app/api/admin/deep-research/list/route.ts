/**
 * ディープリサーチ履歴の一覧取得・本体取得・削除 API
 *  - GET            : 一覧（軽量メタ・新しい順）
 *  - GET ?id=<id>   : 本体（全文・sources）を取得
 *  - DELETE ?id=<id>: 削除
 * ※ 一覧は案A のインデックスから取得（全文は持たない＝肥大化回避）。
 */
import { NextResponse } from "next/server";
import {
  listResearch,
  getResearch,
  deleteResearch,
  researchCreatorId,
} from "@/lib/deep-research/store";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { loadTestSeedIds } from "@/lib/test-seed-server";

/** 237: 任された本物の幹部には、検証用アカウントが作った結果を出さない（一覧・本文・削除） */
async function hiddenCreators(user: Parameters<typeof hidesTestSeedFor>[0]): Promise<Set<string>> {
  return hidesTestSeedFor(user) ? await loadTestSeedIds() : new Set<string>();
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const hidden = await hiddenCreators(auth.user);
    if (id) {
      const result = hidden.has(await researchCreatorId(id)) ? null : await getResearch(id);
      if (!result) {
        return NextResponse.json(
          { error: "対象が見つかりません" },
          { status: 404 }
        );
      }
      return NextResponse.json({ result });
    }

    const results = (await listResearch()).filter((it) => !(it.createdById && hidden.has(it.createdById)));
    return NextResponse.json({ results });
  } catch (e) {
    console.error("Deep Research list error:", e);
    const message = e instanceof Error ? e.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    if ((await hiddenCreators(auth.user)).has(await researchCreatorId(id))) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    await deleteResearch(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Deep Research delete error:", e);
    const message = e instanceof Error ? e.message : "削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
