/**
 * 生成した学習資料（6タイプ）の保存・一覧・本体取得・削除 API
 *  - POST           : 保存（saveDerivedMaterial）
 *  - GET            : 一覧（軽量メタ・新しい順）
 *  - GET ?id=<id>   : 本体（全文）を取得
 *  - DELETE ?id=<id>: 削除
 * ※ content_store（案A: インデックス＋本体分離）へ保存。リサーチ履歴と同じ流儀。
 */
import { NextResponse } from "next/server";
import {
  saveDerivedMaterial,
  listDerivedMaterials,
  getDerivedMaterial,
  deleteDerivedMaterial,
} from "@/lib/deep-research/store";
import {
  DERIVED_MATERIAL_META,
  type DerivedMaterialType,
} from "@/lib/deep-research/types";

export const runtime = "nodejs";

/** 有効な学習資料タイプか判定 */
function isMaterialType(v: unknown): v is DerivedMaterialType {
  return typeof v === "string" && v in DERIVED_MATERIAL_META;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, type, content, sourceTopic, sourceResearchId } = body;

    if (!isMaterialType(type)) {
      return NextResponse.json(
        { error: "type が不正です" },
        { status: 400 }
      );
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "content が空です" },
        { status: 400 }
      );
    }

    const result = await saveDerivedMaterial({
      title: typeof title === "string" && title.trim() ? title : DERIVED_MATERIAL_META[type].label,
      type,
      content,
      sourceTopic: typeof sourceTopic === "string" ? sourceTopic : "",
      sourceResearchId: typeof sourceResearchId === "string" ? sourceResearchId : null,
    });

    return NextResponse.json({ result });
  } catch (e) {
    console.error("Deep Research materials save error:", e);
    const message = e instanceof Error ? e.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const result = await getDerivedMaterial(id);
      if (!result) {
        return NextResponse.json(
          { error: "対象が見つかりません" },
          { status: 404 }
        );
      }
      return NextResponse.json({ result });
    }

    const results = await listDerivedMaterials();
    return NextResponse.json({ results });
  } catch (e) {
    console.error("Deep Research materials list error:", e);
    const message = e instanceof Error ? e.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }

    await deleteDerivedMaterial(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Deep Research materials delete error:", e);
    const message = e instanceof Error ? e.message : "削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
