// QR/URLからのスタッフ自己登録API（指示書55）
// 招待コード一致時のみ service-role でアカウントを作成する（email_confirm: true）。
// 新規ユーザーは非管理者（user_metadata.role なし）。プロフィール骨格も作成する。

import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { saveProfileServer } from "@/lib/staff-profiles-server";
import { emptyProfile } from "@/lib/staff-profiles";
import {
  JOIN_CONFIG_KEY,
  normalizeJoinConfig,
  normalizeJoinCodeInput,
} from "@/lib/join-config";

export const runtime = "nodejs";

// 簡易レート制限（同一IP・10分で8回まで）。サーバーレスのためインスタンス単位の
// ベストエフォート（厳密な保証はしない。主目的は総当たりの抑止）。
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;
const attempts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (attempts.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (list.length >= RATE_MAX) {
    attempts.set(ip, list);
    return true;
  }
  list.push(now);
  attempts.set(ip, list);
  return false;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const code =
    typeof body.code === "string" ? normalizeJoinCodeInput(body.code) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!code || !name || !email || !password) {
    return NextResponse.json(
      { error: "すべての項目を入力してください" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上にしてください" },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "試行回数が多すぎます。しばらくたってからお試しください" },
      { status: 429 }
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  // 招待コード検証（enabled=true かつ コード一致）
  const { data: cfgRow } = await admin
    .from("content_store")
    .select("data")
    .eq("id", JOIN_CONFIG_KEY)
    .maybeSingle();
  const cfg = normalizeJoinConfig(cfgRow?.data ?? null);
  if (!cfg || !cfg.enabled) {
    return NextResponse.json(
      { error: "現在、新規登録の受付は停止中です。管理者にお問い合わせください" },
      { status: 403 }
    );
  }
  if (normalizeJoinCodeInput(cfg.code) !== code) {
    return NextResponse.json(
      { error: "招待コードが正しくありません" },
      { status: 403 }
    );
  }

  // アカウント作成（メール確認不要・非管理者）
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name, name },
    });

  if (createError || !created?.user) {
    const msg = createError?.message ?? "";
    if (
      /already been registered|already registered|email_exists|duplicate/i.test(
        msg
      )
    ) {
      return NextResponse.json(
        { error: "このメールアドレスは登録済みです。ログインしてください" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: `登録に失敗しました: ${msg || "不明なエラー"}` },
      { status: 500 }
    );
  }

  // プロフィール骨格を作成（name はメール全体を入れない＝入力された名前を使用）。
  // 失敗してもアカウント作成自体は成立させる（本人が /profile で保存すれば復旧する）
  try {
    await saveProfileServer(admin, emptyProfile(created.user.id, name));
  } catch {
    /* noop */
  }

  return NextResponse.json({ ok: true });
}
