// スタッフアカウント招待管理 API（Supabase Auth・招待制）
// GET : アカウント一覧
// POST: { action: "invite" | "reinvite" | "disable" | "enable", ... }
//
// セキュリティ:
// - 自由サインアップのUIは作らない。アカウント作成はこのAPI（招待）経由のみ。
// - 原則ログインセッション必須。ただしユーザーが1人もいない初回のみ、
//   未ログインでも招待を許可する（最初の管理者アカウントのブートストラップ用）。
// - 自分自身の無効化は不可（ロックアウト防止）。

import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/staff-profiles-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type AccountSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  banned: boolean;
};

function toSummary(u: User): AccountSummary {
  const meta = u.user_metadata as Record<string, unknown> | null;
  const banned_until = (u as User & { banned_until?: string | null })
    .banned_until;
  return {
    id: u.id,
    email: u.email ?? "",
    displayName:
      typeof meta?.display_name === "string" ? meta.display_name : "",
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    invitedAt: u.invited_at ?? null,
    banned: !!banned_until && new Date(banned_until).getTime() > Date.now(),
  };
}

async function listAllUsers(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (error) throw new Error(error.message);
  return data.users;
}

// 招待メールの戻り先URL（Vercel/ローカル両対応）
function siteOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const [{ user }, users] = await Promise.all([
      getSessionUser(),
      listAllUsers(admin),
    ]);

    if (!user) {
      // 初回（ユーザー0人）だけは招待画面を使えるようにする
      if (users.length === 0) {
        return NextResponse.json({ users: [], bootstrap: true });
      }
      return NextResponse.json(
        { error: "この操作にはログインが必要です" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      users: users.map(toSummary),
      bootstrap: false,
      me: user.id,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const action = body.action;

  try {
    const admin = createSupabaseAdminClient();
    const [{ user: sessionUser }, users] = await Promise.all([
      getSessionUser(),
      listAllUsers(admin),
    ]);

    // 認可: ログイン必須。例外は「ユーザー0人での初回招待」のみ。
    const isBootstrapInvite = users.length === 0 && action === "invite";
    if (!sessionUser && !isBootstrapInvite) {
      return NextResponse.json(
        { error: "この操作にはログインが必要です" },
        { status: 401 }
      );
    }

    const redirectTo = `${siteOrigin(req)}/reset-password`;

    if (action === "invite") {
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
        return NextResponse.json(
          { error: "メールアドレスと表示名を入力してください" },
          { status: 400 }
        );
      }
      if (users.some((u) => (u.email ?? "").toLowerCase() === email)) {
        return NextResponse.json(
          { error: "このメールアドレスは招待済みです" },
          { status: 400 }
        );
      }
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: name },
        redirectTo,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    // 以降の操作は対象ユーザーIDが必要
    const targetId = typeof body.userId === "string" ? body.userId : "";
    const target = users.find((u) => u.id === targetId);
    if (!target) {
      return NextResponse.json(
        { error: "対象のアカウントが見つかりません" },
        { status: 404 }
      );
    }

    if (action === "reinvite") {
      // 一度もログインしていないアカウントのみ: 作り直して招待メールを再送
      if (target.last_sign_in_at) {
        return NextResponse.json(
          {
            error:
              "ログイン済みのアカウントには再招待できません（/login のパスワード再設定を案内してください）",
          },
          { status: 400 }
        );
      }
      const meta = target.user_metadata as Record<string, unknown> | null;
      const name =
        typeof meta?.display_name === "string" ? meta.display_name : "";
      const { error: delError } = await admin.auth.admin.deleteUser(target.id);
      if (delError) throw new Error(delError.message);
      const { error } = await admin.auth.admin.inviteUserByEmail(
        target.email ?? "",
        { data: { display_name: name }, redirectTo }
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "disable") {
      if (sessionUser && target.id === sessionUser.id) {
        return NextResponse.json(
          { error: "自分自身のアカウントは無効化できません" },
          { status: 400 }
        );
      }
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: "87600h", // 約10年 ≒ 無効化
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "enable") {
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: "none",
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
