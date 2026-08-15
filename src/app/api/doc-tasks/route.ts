// 書類進捗ボードAPI（指示書154 / 154-2）
// 非許可ユーザー・未ログインには **すべて 404**（カルテ番号を扱うため機能の存在も伏せる）。
//   GET    ?probe=1 → { ok:true, staleCount }（ナビのリンク＋バッジ判定用・明細は返さない）
//   GET             → { tasks, config, isAdmin, canNotify, today, tableMissing }
//   POST            → 新規登録（種別・カルテ番号・主治医・記入日）
//   PATCH           → 1件更新（工程チェック・日付・メモ・担当など。履歴はサーバーが付ける）
//   DELETE ?id=     → 1件を物理削除
// 実体アクセスはすべて service-role（RLS全拒否テーブル）。

import { NextResponse } from "next/server";
import {
  authorizeDocTasks,
  fetchAllDocTasks,
  fetchDocTaskRow,
  saveDocTaskRow,
  deleteDocTaskRow,
  buildHistoryActions,
  buildDocTaskChanges,
  docTaskSnapshot,
  recordDocTaskLog,
  appendHistory,
  withCompletedAt,
  enteredOnOrToday,
  DocTasksTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/doc-tasks-server";
import {
  buildAlertLines,
  isDocTypeId,
  normalizeSteps,
  summarizeStale,
  todayYmdJst,
  ymd,
  CHART_NO_MAX,
  DOCTOR_MAX,
  MEMO_MAX,
  type DocTask,
  type DocTasksConfig,
} from "@/lib/doc-tasks";

export const runtime = "nodejs";

// 存在を悟らせないため、Next の標準的な 404 と同じ形にする
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof DocTasksTableMissingError) {
    return NextResponse.json(
      { error: e.message, tableMissing: true },
      { status: 503 }
    );
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function genId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 非管理者にはメンバー指名リストを返さない（設定は管理者の領域）。
 * 閾値・主治医候補は入力と表示に必要なのでそのまま返す。
 */
function configForClient(
  config: DocTasksConfig,
  isAdmin: boolean
): DocTasksConfig {
  if (isAdmin) return config;
  return { ...config, viewerUserIds: [], notifyUserIds: [] };
}

export async function GET(req: Request) {
  const auth = await authorizeDocTasks();
  if (!auth.ok) return hidden();

  const probe = new URL(req.url).searchParams.get("probe") === "1";

  try {
    const { tasks, tableMissing } = await fetchAllDocTasks(auth.admin);
    const today = todayYmdJst();

    if (probe) {
      // ナビのバッジ・ホームのアラートカード用。
      // 返すのは件数と「種別◯件が◯日以上未完了」の行だけ（**カルテ番号など明細は返さない**）。
      const summary = summarizeStale(tasks, auth.config, today);
      return NextResponse.json({
        ok: true,
        staleCount: auth.canNotify ? summary.total : 0,
        alertLines: buildAlertLines(summary),
      });
    }

    return NextResponse.json({
      tasks,
      config: configForClient(auth.config, auth.isAdmin),
      isAdmin: auth.isAdmin,
      canNotify: auth.canNotify,
      today,
      tableMissing: tableMissing || auth.tableMissing,
    });
  } catch (e) {
    if (probe) return hidden(); // 判定できないときはリンクを出さない（fail-close）
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeDocTasks();
  if (!auth.ok) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  if (!isDocTypeId(body.docType)) {
    return NextResponse.json({ error: "種別を選んでください" }, { status: 400 });
  }
  const chartNo = str(body.chartNo).trim().slice(0, CHART_NO_MAX);
  if (!chartNo) {
    return NextResponse.json(
      { error: "ID（カルテ番号）は必須です" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const by = auth.userEmail || auth.userId;
  const task: DocTask = withCompletedAt({
    id: genId(),
    docType: body.docType,
    chartNo,
    doctor: str(body.doctor).trim().slice(0, DOCTOR_MAX),
    enteredOn: enteredOnOrToday(body.enteredOn),
    steps: normalizeSteps(body.docType, body.steps),
    assigneeUserId: str(body.assigneeUserId).slice(0, 100),
    memo: str(body.memo).slice(0, MEMO_MAX),
    history: [{ at: now, by, action: "登録" }],
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  });

  try {
    await saveDocTaskRow(auth.admin, task, by, true);
    // 159-B: 新規登録も記録する
    await recordDocTaskLog(auth.admin, {
      by,
      action: "登録",
      chartNo: task.chartNo,
      docType: task.docType,
      changes: docTaskSnapshot(task),
    });
    return NextResponse.json({ task });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeDocTasks();
  if (!auth.ok) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = str(body.id);
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }

  try {
    const prev = await fetchDocTaskRow(auth.admin, id);
    if (!prev) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }

    // 種別は変更させない（工程定義が変わって記録の意味が壊れるため）
    const next: DocTask = withCompletedAt({
      ...prev,
      chartNo:
        "chartNo" in body
          ? str(body.chartNo).trim().slice(0, CHART_NO_MAX) || prev.chartNo
          : prev.chartNo,
      doctor:
        "doctor" in body
          ? str(body.doctor).trim().slice(0, DOCTOR_MAX)
          : prev.doctor,
      enteredOn:
        "enteredOn" in body ? ymd(body.enteredOn) || prev.enteredOn : prev.enteredOn,
      steps:
        "steps" in body ? normalizeSteps(prev.docType, body.steps) : prev.steps,
      assigneeUserId:
        "assigneeUserId" in body
          ? str(body.assigneeUserId).slice(0, 100)
          : prev.assigneeUserId,
      memo: "memo" in body ? str(body.memo).slice(0, MEMO_MAX) : prev.memo,
      updatedAt: new Date().toISOString(),
    });

    const by = auth.userEmail || auth.userId;
    const actions = buildHistoryActions(prev, next);
    const saved: DocTask = { ...next, history: appendHistory(next, actions, by) };

    await saveDocTaskRow(auth.admin, saved, by, false);
    // 159-B: 変更前 → 変更後を記録する（変更が無ければ残さない）
    const changes = buildDocTaskChanges(prev, saved);
    if (changes.length > 0) {
      await recordDocTaskLog(auth.admin, {
        by,
        action: "更新",
        chartNo: saved.chartNo,
        docType: saved.docType,
        changes,
      });
    }
    return NextResponse.json({ task: saved });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeDocTasks();
  if (!auth.ok) return hidden();

  const id = str(new URL(req.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  try {
    // 159-B: 削除も記録する。**タスクごと消えると履歴も消える**ので、
    // 消す前に内容を読み、独立した操作ログとして残しておく。
    const prev = await fetchDocTaskRow(auth.admin, id);
    await deleteDocTaskRow(auth.admin, id);
    if (prev) {
      await recordDocTaskLog(auth.admin, {
        by: auth.userEmail || auth.userId,
        action: "削除",
        chartNo: prev.chartNo,
        docType: prev.docType,
        changes: docTaskSnapshot(prev),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
