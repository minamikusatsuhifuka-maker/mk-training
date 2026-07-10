// 仮パスワード発行 API（メール不要のアカウント有効化）
// POST: { userId } → サーバーでランダム仮パスワードを生成して設定し、
//       レスポンスで一度だけ返す（content_store・ログ等どこにも保存しない）。
//
// 認可:
// - ログイン済みセッションがあれば許可。
// - 未ログインでも「全ユーザーの last_sign_in_at が null（まだ誰も一度も
//   ログインしていない）」場合に限り許可（初期セットアップ救済）。
//   誰か1人でもログイン履歴があれば 401。

import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/staff-profiles-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// 紛らわしい文字（l/1/O/0、および l と見分けにくい大文字 I）を除外
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALL = UPPER + LOWER + DIGIT;
const PASSWORD_LENGTH = 14; // 仕様: 12〜16文字

// 英大・英小・数字を必ず1文字以上含むランダム仮パスワードを生成
function generateTempPassword(): string {
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGIT[randomInt(DIGIT.length)],
  ];
  while (chars.length < PASSWORD_LENGTH) {
    chars.push(ALL[randomInt(ALL.length)]);
  }
  // Fisher–Yates シャッフル（先頭3文字の種別が固定にならないように）
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!userId && !email) {
    return NextResponse.json(
      { error: "対象ユーザーを指定してください" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const [{ user: sessionUser }, listed] = await Promise.all([
      getSessionUser(),
      admin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    ]);
    if (listed.error) throw new Error(listed.error.message);
    const users = listed.data.users;

    // 認可: ログイン必須。例外は「まだ誰も一度もログインしていない」場合のみ。
    const nobodySignedIn =
      users.length > 0 && users.every((u) => !u.last_sign_in_at);
    if (!sessionUser && !nobodySignedIn) {
      return NextResponse.json(
        { error: "この操作にはログインが必要です" },
        { status: 401 }
      );
    }

    const target = users.find((u) =>
      userId ? u.id === userId : (u.email ?? "").toLowerCase() === email
    );
    if (!target) {
      return NextResponse.json(
        { error: "対象のアカウントが見つかりません" },
        { status: 404 }
      );
    }

    const tempPassword = generateTempPassword();
    const { error } = await admin.auth.admin.updateUserById(target.id, {
      password: tempPassword,
    });
    if (error) throw new Error(error.message);

    // 仮パスワードはこのレスポンスで一度だけ返す（保存・ログ出力はしない）
    return NextResponse.json({ tempPassword });
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗しました" },
      { status: 500 }
    );
  }
}
