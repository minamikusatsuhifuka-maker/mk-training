// 【一時ルート・使用後に削除】指示書41: content_store `medical_fees` の監査パッチ適用
// content_store の行が存在すると src/data の既定値より優先されるため、
// 保存済みデータにも同じ確定修正＋statusフラグを適用する必要がある。
// GET  ?token=...          : 現在の保存値（対象項目の要約）を返す
// POST ?token=...          : パッチを適用して保存し、適用結果を返す
// トークンは一度きりの作業用。作業完了後このファイルごと削除する。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CONTENT_KEYS } from "@/lib/content-store";
import type { MedicalFee } from "@/data/medical_fees";

export const runtime = "nodejs";

const AUDIT_TOKEN = "9bc6230ca465218ea31e56c4e3073f55";

// 指示書41の確定修正＋コード修正（idベース）。ここに無いidは status:needs_check のみ付与。
const PATCHES: Record<string, Partial<MedicalFee>> = {
  f01: { status: "verified" },
  f02: { status: "verified" },
  f03: { status: "verified" },
  f06: { status: "verified" },
  f08: {
    code: "D417",
    name: "組織試験採取（皮膚）〔皮膚生検〕",
    description:
      "皮膚の一部を採取して組織学的に検査する（D417 組織試験採取・皮膚）",
    notes: "病理組織標本作製・病理診断料を別途算定する",
    status: "needs_check",
  },
  f11: {
    code: "D017",
    description:
      "白癬・カンジダの直接鏡検診断（D017 排泄物、滲出物又は分泌物の細菌顕微鏡検査）",
    status: "needs_check",
  },
  f12: {
    code: "D018",
    description: "皮膚感染症の原因菌同定。MRSA確認等（D018 細菌培養同定検査）",
    status: "needs_check",
  },
  f14: {
    code: "J053",
    name: "皮膚科軟膏処置（100cm²以上500cm²未満）",
    points: 55,
    description: "外来で軟膏処置を行った場合（100cm²以上500cm²未満）",
    notes: "100cm²未満は基本診療料に含まれ算定不可",
    status: "verified",
  },
  f17: {
    code: "J056",
    name: "いぼ等冷凍凝固法（液体窒素・3箇所以下）",
    points: 210,
    description: "液体窒素による冷凍凝固（いぼ・日光角化症等）。3箇所以下",
    notes: "4箇所以上は270点（次行）。箇所数で点数が変わる",
    status: "verified",
  },
  f18: {
    points: 52,
    notes: "100cm²以上500cm²未満：60点",
    status: "verified",
  },
  f27: {
    code: "J054",
    name: "皮膚科光線療法（ナローバンドUVB）",
    description:
      "皮膚科光線療法の中波紫外線療法（308〜313nm）。アトピー・乾癬・白斑等",
    status: "verified",
  },
  f28: {
    notes: "院外処方の場合は処方箋料（60点）",
    status: "needs_check",
  },
  f29: {
    points: 60,
    notes: "一般名処方加算あり。令和6年改定で68点→60点",
    status: "verified",
  },
};

// f17 の直後に挿入する新行（4箇所以上）
const F17B: MedicalFee = {
  id: "f17b",
  code: "J056",
  name: "いぼ等冷凍凝固法（液体窒素・4箇所以上）",
  points: 270,
  category: "皮膚科処置",
  description: "液体窒素による冷凍凝固（いぼ・日光角化症等）。4箇所以上",
  notes: "3箇所以下は210点（前行）",
  status: "verified",
};

function summarize(items: MedicalFee[]) {
  return items.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    points: f.points,
    status: f.status ?? "(none)",
  }));
}

function checkToken(req: NextRequest): NextResponse | null {
  if (req.nextUrl.searchParams.get("token") !== AUDIT_TOKEN) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return null;
}

async function loadRow() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("content_store")
    .select("data")
    .eq("id", CONTENT_KEYS.medicalFees)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { admin, row: (data?.data as MedicalFee[] | null) ?? null };
}

export async function GET(req: NextRequest) {
  const denied = checkToken(req);
  if (denied) return denied;
  try {
    const { row } = await loadRow();
    if (!row) return NextResponse.json({ exists: false });
    return NextResponse.json({
      exists: true,
      count: row.length,
      items: summarize(row),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = checkToken(req);
  if (denied) return denied;
  try {
    const { admin, row } = await loadRow();
    if (!row) {
      return NextResponse.json({
        exists: false,
        patched: false,
        note: "content_store行なし。src/dataの既定値がそのまま有効",
      });
    }
    let next: MedicalFee[] = row.map((f) => {
      const patch = PATCHES[f.id];
      const merged = patch ? { ...f, ...patch } : f;
      // 指定外の項目は現状値のまま needs_check を付与（既にあれば維持）
      return { ...merged, status: merged.status ?? "needs_check" };
    });
    // f17b（4箇所以上）を f17 の直後に挿入（無ければ）
    if (!next.some((f) => f.id === "f17b")) {
      const idx = next.findIndex((f) => f.id === "f17");
      if (idx >= 0) {
        next = [...next.slice(0, idx + 1), F17B, ...next.slice(idx + 1)];
      } else {
        next.push(F17B);
      }
    }
    const { error } = await admin.from("content_store").upsert({
      id: CONTENT_KEYS.medicalFees,
      content_type: "medical",
      data: next as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({
      exists: true,
      patched: true,
      count: next.length,
      items: summarize(next),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
