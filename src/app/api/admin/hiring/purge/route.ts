// 経歴・入職時の想いの一括削除API（指示書189 A）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET  ?user=<userId> → 削除される内容の件数（学歴◯件…）と、追加で選べるものの件数（原本・スカウター）、パスワードの設定状況
//   POST { userId, password, includeDocs?, includeScouter? } → **削除用パスワードをサーバー側で照合**してから削除。件数を返す
//   連絡先・家族構成はこの操作の対象にしない。操作ログには誰が・いつ・誰の・何件だけ（本文・入力値は残さない）。

import { NextRequest, NextResponse } from "next/server";
import { HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, deleteHiringDataOfUser, fetchHiringDocs, fetchHiringProfile, recordHiringLog, saveHiringProfile } from "@/lib/hiring-docs-server";
import { deleteScouterResultsOfUser, fetchScouterResults } from "@/lib/scouter-server";
import { checkDeletePassword, deletePasswordStatus } from "@/lib/delete-password-server";
import { purgeCountsOf } from "@/lib/delete-password";
import { normalizeHiringProfile } from "@/lib/hiring-docs";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  const userId = req.nextUrl.searchParams.get("user") ?? "";
  if (!userId) return NextResponse.json({ error: "user は必須です" }, { status: 400 });
  try {
    const [profile, { docs }, { results }, status] = await Promise.all([
      fetchHiringProfile(auth.admin, userId),
      fetchHiringDocs(auth.admin, userId),
      fetchScouterResults(auth.admin, userId),
      deletePasswordStatus(auth.admin),
    ]);
    return NextResponse.json({ counts: purgeCountsOf(profile, docs.length, results.length), password: status });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const includeDocs = body.includeDocs === true;
  const includeScouter = body.includeScouter === true;
  if (!userId) return NextResponse.json({ error: "対象のスタッフが指定されていません" }, { status: 400 });
  try {
    const by = auth.userEmail || auth.userId;
    // B-2: 照合はサーバー側（ここ）だけ。B-3: 失敗回数・ロックも中で更新
    const check = await checkDeletePassword(auth.admin, password, by);
    if (!check.ok) {
      if (check.reason === "unset") return NextResponse.json({ error: "削除用パスワードが未設定のため実行できません。管理画面「🗑 削除用パスワードの設定」で設定してください", unset: true }, { status: 409 });
      if (check.reason === "locked") return NextResponse.json({ error: `削除用パスワードの入力が5回続けて違ったため、${check.lockedUntil.slice(11, 16)}（UTC）まで15分間ロックしています`, lockedUntil: check.lockedUntil }, { status: 423 });
      return NextResponse.json({ error: check.lockedUntil ? "削除用パスワードが違います。5回続けて違ったため15分間ロックしました" : `削除用パスワードが違います（あと${check.attemptsLeft}回でロック）`, attemptsLeft: check.attemptsLeft, lockedUntil: check.lockedUntil }, { status: 403 });
    }

    // A-1: 経歴・入職時の想い（全項目）
    const prev = await fetchHiringProfile(auth.admin, userId);
    const before = purgeCountsOf(prev, 0, 0);
    await saveHiringProfile(auth.admin, normalizeHiringProfile(userId, null), by);
    // A-2: 選んだ場合だけ
    let docs = 0;
    let scouter = 0;
    if (includeScouter) scouter = await deleteScouterResultsOfUser(auth.admin, userId);
    if (includeDocs) docs = (await deleteHiringDataOfUser(auth.admin, userId)).docs;
    await recordHiringLog(auth.admin, {
      by,
      action: "経歴・入職時の想いを一括削除（削除用パスワード照合済み）",
      target: userId,
      changes: [
        ...before.profile.map((p) => ({ field: p.label, before: `${p.count}件`, after: "0件" })),
        { field: "採用資料の原本", before: includeDocs ? `${docs}件` : "対象外", after: includeDocs ? "0件" : "対象外" },
        { field: "スカウター", before: includeScouter ? `${scouter}件` : "対象外", after: includeScouter ? "0件" : "対象外" },
        { field: "連絡先・家族構成", before: "対象外", after: "対象外" },
      ],
    });
    return NextResponse.json({ ok: true, deleted: { profile: before.profile, profileTotal: before.profileTotal, docs, scouter } });
  } catch (e) {
    return errorResponse(e);
  }
}
