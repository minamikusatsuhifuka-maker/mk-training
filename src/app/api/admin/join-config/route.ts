// 招待コード設定の管理API（指示書55・管理者のみ）
// GET: 現在の設定（未作成なら初回コードを自動発行して保存）
// PUT: { enabled?: boolean, regenerate?: boolean } — 受付切替／コード再発行

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import {
  JOIN_CONFIG_KEY,
  generateJoinCode,
  normalizeJoinConfig,
  type JoinConfig,
} from "@/lib/join-config";

export const runtime = "nodejs";

function adminClient() {
  try {
    return { admin: createSupabaseAdminClient(), response: null };
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) {
      return {
        admin: null,
        response: NextResponse.json({ error: e.message }, { status: 503 }),
      };
    }
    throw e;
  }
}

async function loadConfig(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<JoinConfig | null> {
  const { data } = await admin
    .from("content_store")
    .select("data")
    .eq("id", JOIN_CONFIG_KEY)
    .maybeSingle();
  return normalizeJoinConfig(data?.data ?? null);
}

async function saveConfig(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  cfg: JoinConfig
): Promise<boolean> {
  const { error } = await admin.from("content_store").upsert({
    id: JOIN_CONFIG_KEY,
    content_type: "config",
    data: cfg as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { admin, response } = adminClient();
  if (response) return response;

  let cfg = await loadConfig(admin!);
  if (!cfg) {
    // 初回アクセス時にコードを自動発行（既定は受付停止＝管理者が明示的に開始する）
    cfg = {
      enabled: false,
      code: generateJoinCode(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await saveConfig(admin!, cfg);
    if (!ok) {
      return NextResponse.json(
        { error: "設定の初期化に失敗しました" },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ config: cfg });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { admin, response } = adminClient();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const current = (await loadConfig(admin!)) ?? {
    enabled: false,
    code: generateJoinCode(),
    updatedAt: "",
  };

  const next: JoinConfig = {
    enabled:
      typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    code: body.regenerate === true ? generateJoinCode() : current.code,
    updatedAt: new Date().toISOString(),
  };

  const ok = await saveConfig(admin!, next);
  if (!ok) {
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ config: next });
}
