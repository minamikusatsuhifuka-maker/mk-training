// 院長の四象限マトリクスAPI（指示書201 → 202で改修）
// **院長のみ**（requireAdmin＝app_metadata.role。委任は見ない）
//
//   GET              → { tasks, books, logs }（自分の四象限の項目・9マス帳・操作の記録50件）
//   GET  ?focus=1    → { tasks }（★の項目3件だけ。管理画面のトップ用・201 C-3）
//   GET  ?id=<id>    → { record }（9マス画面のための単体取得。項目でも9マス帳でも同じ口）
//   GET  ?selftest=1 → { ok, steps }（202 §0: 保存先に書ける／読み戻せる／消せるの点検）
//   POST             → 1件追加 body: { kind: "task" | "book", fields: {...} }
//   PATCH            → 1件更新 body: { id, fields: {...変える項目だけ}, baseUpdatedAt? }
//   DELETE ?id=      → 1件を物理削除（9マスに残っていたリンクは外す）
//
// 【項目は fields に入れる（176の教訓）】
// 平たく { id, ...項目 } で送ると、項目名とリクエストの制御用の名前がぶつかる。
//
// 【更新は「送られてきた項目だけ」差し替える（169と同じ）】
// 項目が欠けたリクエストで本文（メモ・9マス）が黙って消えないようにする。
//
// 【202 §5: 複数タブの同時編集】
// PATCH は baseUpdatedAt（画面がいま持っている版）を受け取り、サーバーの版と違えば
// **保存せず409**（「別の画面で更新されました。再読み込みしてください」）。
//
// 【202 §0: 失敗を黙って飲み込まない】
// DBのエラーは Postgres のコードごとに「何をすればよいか」まで書いた文言で返す。
// 書き込みは priority-matrix-server.ts が**読み戻して確かめる**ので、
// 「200を返したのに入っていない」は起きない。
//
// 実体アクセスはすべて service-role（RLS全拒否の private_store）。owner_id はセッションの userId で固定し、
// リクエストから owner を受け取る口は作らない。クライアント値は必ず normalize → validate を通す。

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  MatrixDbError,
  ServiceRoleMissingError,
  canAddFocus,
  clearLinksTo,
  deleteRecordRow,
  describeDbError,
  fetchMatrixLogs,
  fetchRecord,
  fetchRecords,
  newBookId,
  newTaskId,
  priorityMatrixAdmin,
  recordMatrixLog,
  runSelfTest,
  saveRecord,
} from "@/lib/priority-matrix-server";
import {
  CONFLICT_CODE,
  FOCUS_LIMIT_MESSAGE,
  VERSION_CONFLICT_MESSAGE,
  focusTasks,
  normalizeRecord,
  validateRecord,
  type GridBook,
  type MatrixRecord,
  type PriorityTask,
} from "@/lib/priority-matrix";

export const runtime = "nodejs";

const LOG_LIMIT = 50;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  if (e instanceof MatrixDbError) {
    // 原因の種類（Postgresのコード）まで画面に出す。黙って500にしない（202 §0-3）
    console.error("[priority-matrix]", e.operation, e.pgCode, e.message);
    return NextResponse.json(
      { error: describeDbError(e), code: e.pgCode },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === "object" && !Array.isArray(j)
      ? (j as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readFields(body: Record<string, unknown>): Record<string, unknown> | null {
  const f = body.fields;
  return f && typeof f === "object" && !Array.isArray(f)
    ? (f as Record<string, unknown>)
    : null;
}

/** 新しい項目は、その象限の一番下に置く */
function nextOrder(tasks: PriorityTask[], quadrant: number): number {
  const same = tasks.filter((t) => t.quadrant === quadrant);
  return same.length === 0 ? 0 : Math.max(...same.map((t) => t.order)) + 1;
}

function nextBookOrder(books: GridBook[]): number {
  return books.length === 0 ? 0 : Math.max(...books.map((b) => b.order)) + 1;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const sp = req.nextUrl.searchParams;
  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;

    // 202 §0: 保存の点検。使い捨てのレコードで「書ける／読み戻せる／消せる」を確かめる
    if (sp.get("selftest") === "1") {
      return NextResponse.json(await runSelfTest(admin, ownerId));
    }

    // 9マス画面のための単体取得
    const id = sp.get("id");
    if (id) {
      const record = await fetchRecord(admin, ownerId, id);
      if (!record) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
      return NextResponse.json({ record });
    }

    const { tasks, books } = await fetchRecords(admin, ownerId);
    // 管理画面のトップ用。★の3件だけ返す（他の記録・操作の記録は渡さない）
    if (sp.get("focus") === "1") {
      return NextResponse.json({ tasks: focusTasks(tasks) });
    }
    const logs = await fetchMatrixLogs(admin, ownerId, LOG_LIMIT);
    return NextResponse.json({ tasks, books, logs });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const fields = readFields(body);
  if (!fields) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const kind = body.kind === "book" ? "book" : "task";

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const existing = await fetchRecords(admin, ownerId);
    const now = new Date().toISOString();

    if (kind === "book") {
      const id = newBookId();
      const record = normalizeRecord(id, {
        order: nextBookOrder(existing.books),
        ...fields,
        kind: "book",
        createdAt: now,
        updatedAt: now,
      });
      if (!record) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
      const problem = validateRecord(record);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      await saveRecord(admin, ownerId, record, "9マス帳の作成");
      await recordMatrixLog(admin, ownerId, {
        by: auth.user.email ?? ownerId,
        action: "9マス帳の作成",
        taskId: record.id,
        quadrant: 0,
      });
      return NextResponse.json({ record });
    }

    const id = newTaskId();
    const record = normalizeRecord(id, {
      order: nextOrder(existing.tasks, typeof fields.quadrant === "number" ? fields.quadrant : 2),
      ...fields,
      kind: "task",
      createdAt: now,
      updatedAt: now,
    }) as PriorityTask | null;
    if (!record) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
    const problem = validateRecord(record);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // ★は3件まで（201 C-3）。超えるときは保存しない
    if (record.focus && !(await canAddFocus(admin, ownerId, id))) {
      return NextResponse.json({ error: FOCUS_LIMIT_MESSAGE }, { status: 400 });
    }

    await saveRecord(admin, ownerId, record, "追加");
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action: "追加",
      taskId: record.id,
      quadrant: record.quadrant,
    });
    return NextResponse.json({ record });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  const fields = readFields(body);
  if (!fields) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : "";

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const prev = await fetchRecord(admin, ownerId, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });

    // 202 §5: 版が食い違えば保存しない（別のタブの書きかけを上書きしない）
    if (baseUpdatedAt && baseUpdatedAt !== prev.updatedAt) {
      return NextResponse.json(
        { error: VERSION_CONFLICT_MESSAGE, code: CONFLICT_CODE },
        { status: 409 }
      );
    }

    // 送られてきた項目だけ差し替える。status が完了から外れたら完了日は normalize が落とす。
    // kind は**リクエストでは変えられない**（項目と9マス帳の入れ替えを許さない）
    const next = normalizeRecord(id, {
      ...(prev as unknown as Record<string, unknown>),
      ...fields,
      kind: prev.kind,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
    const problem = validateRecord(next);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (
      next.kind === "task" &&
      prev.kind === "task" &&
      next.focus &&
      !prev.focus &&
      !(await canAddFocus(admin, ownerId, id))
    ) {
      return NextResponse.json({ error: FOCUS_LIMIT_MESSAGE }, { status: 400 });
    }

    await saveRecord(admin, ownerId, next, "保存");
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action: logAction(prev, next),
      taskId: next.id,
      quadrant: next.kind === "task" ? next.quadrant : 0,
    });
    return NextResponse.json({ record: next });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 操作の記録に残す言葉（本文は残さない） */
function logAction(prev: MatrixRecord, next: MatrixRecord): string {
  if (prev.kind === "task" && next.kind === "task") {
    if (next.quadrant !== prev.quadrant) return "象限の移動";
    if (next.status !== prev.status) return "状態の変更";
    if (next.focus !== prev.focus) return next.focus ? "★を付けた" : "★を外した";
  }
  if (JSON.stringify(prev.cells) !== JSON.stringify(next.cells)) return "9マスの更新";
  return "更新";
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const prev = await fetchRecord(admin, ownerId, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    await deleteRecordRow(admin, ownerId, id);
    await clearLinksTo(admin, ownerId, id);
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action: prev.kind === "book" ? "9マス帳の削除" : "削除",
      taskId: id,
      quadrant: prev.kind === "task" ? prev.quadrant : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
