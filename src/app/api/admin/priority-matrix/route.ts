// 院長の四象限マトリクスAPI（指示書201）— **院長のみ**（requireAdmin＝app_metadata.role。委任は見ない）
//
//   GET            → { tasks, logs }（tasks＝自分のタスク全件・logs＝操作の記録50件）
//   GET  ?focus=1  → { tasks }（★のタスク3件だけ。管理画面のトップ用・201 C-3）
//   POST           → 1件追加 body: { fields: { title, quadrant, ... } }
//   PATCH          → 1件更新 body: { id, fields: { ...変える項目だけ } }
//   DELETE ?id=    → 1件を物理削除（9マスに残っていたリンクは外す）
//
// 【項目は fields に入れる（176の教訓）】
// 平たく { id, ...項目 } で送ると、項目名とリクエストの制御用の名前がぶつかる。
// 記録の制御（id）と項目の名前空間を分け、どの項目名でも衝突しないようにする。
//
// 【更新は「送られてきた項目だけ」差し替える（169と同じ）】
// 項目が欠けたリクエストで本文（メモ・9マス）が黙って消えないようにする。
//
// 実体アクセスはすべて service-role（RLS全拒否の private_store）。owner_id はセッションの userId で固定し、
// リクエストから owner を受け取る口は作らない。クライアント値は必ず normalizeTask → validateTask を通す。

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  ServiceRoleMissingError,
  canAddFocus,
  clearLinksTo,
  deleteTaskRow,
  fetchMatrixLogs,
  fetchTask,
  fetchTasks,
  newTaskId,
  priorityMatrixAdmin,
  recordMatrixLog,
  saveTask,
} from "@/lib/priority-matrix-server";
import {
  FOCUS_MAX,
  focusTasks,
  normalizeTask,
  validateTask,
  type PriorityTask,
} from "@/lib/priority-matrix";

export const runtime = "nodejs";

const LOG_LIMIT = 50;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
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

/** 新しいタスクは、その象限の一番下に置く */
function nextOrder(tasks: PriorityTask[], quadrant: number): number {
  const same = tasks.filter((t) => t.quadrant === quadrant);
  return same.length === 0 ? 0 : Math.max(...same.map((t) => t.order)) + 1;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const admin = priorityMatrixAdmin();
    const tasks = await fetchTasks(admin, auth.user.id);
    // 管理画面のトップ用。★の3件だけ返す（他のタスク・操作の記録は渡さない）
    if (req.nextUrl.searchParams.get("focus") === "1") {
      return NextResponse.json({ tasks: focusTasks(tasks) });
    }
    const logs = await fetchMatrixLogs(admin, auth.user.id, LOG_LIMIT);
    return NextResponse.json({ tasks, logs });
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

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const existing = await fetchTasks(admin, ownerId);
    const id = newTaskId();
    const now = new Date().toISOString();
    const task = normalizeTask(id, {
      order: nextOrder(existing, typeof fields.quadrant === "number" ? fields.quadrant : 2),
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
    if (!task) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
    const problem = validateTask(task);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // ★は3件まで（201 C-3）。超えるときは保存しない
    if (task.focus && !(await canAddFocus(admin, ownerId, id))) {
      return NextResponse.json(
        { error: `★（いま注力すること）は${FOCUS_MAX}件までです` },
        { status: 400 }
      );
    }

    await saveTask(admin, ownerId, task);
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action: "追加",
      taskId: task.id,
      quadrant: task.quadrant,
    });
    return NextResponse.json({ task });
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

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const prev = await fetchTask(admin, ownerId, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });

    // 送られてきた項目だけ差し替える。status が完了から外れたら完了日は normalizeTask が落とす
    const next = normalizeTask(id, {
      ...(prev as unknown as Record<string, unknown>),
      ...fields,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
    const problem = validateTask(next);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (next.focus && !prev.focus && !(await canAddFocus(admin, ownerId, id))) {
      return NextResponse.json(
        { error: `★（いま注力すること）は${FOCUS_MAX}件までです` },
        { status: 400 }
      );
    }

    await saveTask(admin, ownerId, next);
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action:
        next.quadrant !== prev.quadrant
          ? "象限の移動"
          : next.status !== prev.status
            ? "状態の変更"
            : "更新",
      taskId: next.id,
      quadrant: next.quadrant,
    });
    return NextResponse.json({ task: next });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

  try {
    const admin = priorityMatrixAdmin();
    const ownerId = auth.user.id;
    const prev = await fetchTask(admin, ownerId, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    await deleteTaskRow(admin, ownerId, id);
    await clearLinksTo(admin, ownerId, id);
    await recordMatrixLog(admin, ownerId, {
      by: auth.user.email ?? ownerId,
      action: "削除",
      taskId: id,
      quadrant: prev.quadrant,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
