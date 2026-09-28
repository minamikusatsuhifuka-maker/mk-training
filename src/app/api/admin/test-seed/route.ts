// 検証用データAPI（指示書191）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET    → { accounts（メール・表示名・作成済みか）, prospect, counts }
//   POST   { passwordHanako, passwordJiro } → 2アカウントと架空データを作成（何度押しても重複しない）。パスワードは Auth にだけ渡す
//   DELETE { deletePassword } → 189の削除用パスワードを照合し、検証用の印が付いたものだけを一括削除
// 応答・ログにパスワードは含めない。

import { NextRequest, NextResponse } from "next/server";
import { HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, recordHiringLog } from "@/lib/hiring-docs-server";
import { checkDeletePassword } from "@/lib/delete-password-server";
import { purgeTestData, seedTestData, testSeedStatus } from "@/lib/test-seed-run-server";
import { validateTestPassword } from "@/lib/test-seed";

export const runtime = "nodejs";
export const maxDuration = 120;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET() {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  try {
    return NextResponse.json(await testSeedStatus(auth.admin));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { passwordHanako?: unknown; passwordJiro?: unknown };
  try {
    body = (await req.json()) as { passwordHanako?: unknown; passwordJiro?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const e1 = validateTestPassword(body.passwordHanako);
  const e2 = validateTestPassword(body.passwordJiro);
  if (e1 || e2) return NextResponse.json({ error: `テスト花子: ${e1 || "OK"} ／ テスト次郎: ${e2 || "OK"}` }, { status: 400 });
  try {
    const result = await seedTestData(auth.admin, auth.userEmail || auth.userId, auth.userId, { hanako: body.passwordHanako as string, jiro: body.passwordJiro as string });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { deletePassword?: unknown };
  try {
    body = (await req.json()) as { deletePassword?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const by = auth.userEmail || auth.userId;
  try {
    const check = await checkDeletePassword(auth.admin, typeof body.deletePassword === "string" ? body.deletePassword : "", by);
    if (!check.ok) {
      if (check.reason === "unset") return NextResponse.json({ error: "削除用パスワードが未設定のため実行できません。管理画面「🗑 削除用パスワードの設定」で設定してください", unset: true }, { status: 409 });
      if (check.reason === "locked") return NextResponse.json({ error: "削除用パスワードの入力が5回続けて違ったため、15分間ロックしています", lockedUntil: check.lockedUntil }, { status: 423 });
      return NextResponse.json({ error: check.lockedUntil ? "削除用パスワードが違います。5回続けて違ったため15分間ロックしました" : `削除用パスワードが違います（あと${check.attemptsLeft}回でロック）` }, { status: 403 });
    }
    const result = await purgeTestData(auth.admin, by);
    if (result.foreignBlocked.length > 0) {
      await recordHiringLog(auth.admin, { by, action: "検証用データの削除を中止（検証用以外が対象一覧に混入）", target: "-", changes: [{ field: "件数", before: "", after: `${result.foreignBlocked.length}件` }] });
      return NextResponse.json({ error: "対象一覧に検証用以外のデータが混ざっていたため、何も削除せずに中止しました", foreignBlocked: result.foreignBlocked }, { status: 409 });
    }
    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (e) {
    return errorResponse(e);
  }
}
