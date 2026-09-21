// 院長の振り返り記録API（指示書173）
// 非許可ユーザー・未ログインには **すべて 404**（赤裸々な内容を扱うため機能の存在も伏せる）。
//   GET    ?probe=1 → { ok:true }（ナビのリンク判定用・中身は返さない）
//   GET             → { periods, events, initiatives, snapshots, delegations, isAdmin, tableMissing }
//   POST            → 1件登録（**管理者のみ**）body: { kind, ...項目 }
//   PATCH           → 1件更新（**管理者のみ**）body: { kind, id, ...項目 }
//   DELETE ?kind=&id= → 1件を物理削除（**管理者のみ**。期を消すとその期の記録も消える）
//
// 実体アクセスはすべて service-role（RLS全拒否テーブル）。
// クライアント値は信用せず、必ず normalizeRecord → validateRecord を通す。

import { NextResponse } from "next/server";
import {
  authorizeDirectorRetrospective,
  fetchAllRecords,
  fetchRecord,
  saveRecord,
  deleteRecordCascade,
  newRecordId,
  recordRetrospectiveLog,
  RetrospectiveTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/director-retrospective-server";
import {
  KIND_LABEL,
  buildRecordChanges,
  isRecordKind,
  normalizeRecord,
  recordTitle,
  snapshotOfPeriod,
  validateRecord,
  type RecordKind,
  type RetrospectiveRecord,
} from "@/lib/director-retrospective";

export const runtime = "nodejs";

// 存在を悟らせないため、Next の標準的な 404 と同じ形にする
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof RetrospectiveTableMissingError) {
    return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

/**
 * 送られてきた内容を1件の記録に整える。
 * 更新のときは **送られてきた項目だけを差し替える**（169と同じ。項目欠落で本文が黙って消えない）。
 */
function buildRecord(
  kind: RecordKind,
  id: string,
  body: Record<string, unknown>,
  base: RetrospectiveRecord | null
): RetrospectiveRecord | null {
  const now = new Date().toISOString();
  const baseData = base ? (base.record as unknown as Record<string, unknown>) : {};
  return normalizeRecord(kind, id, {
    ...baseData,
    ...body,
    createdAt: (baseData.createdAt as string) || now,
    updatedAt: now,
  });
}

const REQUIRED_MESSAGE: Record<RecordKind, string> = {
  period: "期の名称は必須です",
  event: "期と内容は必須です",
  initiative: "期と施策名は必須です",
  snapshot: "期は必須です",
  delegation: "期と業務は必須です",
};

export async function GET(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok) return hidden();

  const probe = new URL(req.url).searchParams.get("probe") === "1";
  // ナビのリンク判定用。**中身は一切返さない**（開けるかどうかだけ）
  if (probe) return NextResponse.json({ ok: true });

  try {
    const { data, tableMissing } = await fetchAllRecords(auth.admin);
    return NextResponse.json({ ...data, isAdmin: auth.isAdmin, tableMissing });
  } catch (e) {
    return errorResponse(e);
  }
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 期が実在するか（子の記録を孤児にしない） */
async function periodExists(
  auth: Extract<Awaited<ReturnType<typeof authorizeDirectorRetrospective>>, { ok: true }>,
  periodId: string
): Promise<boolean> {
  const p = await fetchRecord(auth.admin, "period", periodId);
  return !!p;
}

export async function POST(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok) return hidden();
  // 編集は管理者のみ。存在は隠したままにする
  if (!auth.isAdmin) return hidden();

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const kind = body.kind;
  if (!isRecordKind(kind)) {
    return NextResponse.json({ error: "記録の種類が不正です" }, { status: 400 });
  }

  const rec = buildRecord(kind, newRecordId(kind), body, null);
  if (!rec) return NextResponse.json({ error: REQUIRED_MESSAGE[kind] }, { status: 400 });
  const problem = validateRecord(rec);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    if (rec.kind !== "period") {
      if (!(await periodExists(auth, rec.record.periodId))) {
        return NextResponse.json({ error: "その期は存在しません" }, { status: 400 });
      }
      // スナップショットは1期1件（173-2-4「期ごと」）。2件目は更新で扱う
      if (rec.kind === "snapshot") {
        const { data } = await fetchAllRecords(auth.admin);
        if (snapshotOfPeriod(data.snapshots, rec.record.periodId)) {
          return NextResponse.json(
            { error: "この期のスナップショットはすでにあります（編集してください）" },
            { status: 400 }
          );
        }
      }
    }

    const by = auth.userEmail || auth.userId;
    await saveRecord(auth.admin, rec, by, true);
    await recordRetrospectiveLog(auth.admin, {
      by,
      action: "登録",
      kind: KIND_LABEL[rec.kind],
      target: recordTitle(rec),
      changes: buildRecordChanges(null, rec),
    });
    return NextResponse.json(rec);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  const kind = body.kind;
  if (!isRecordKind(kind)) {
    return NextResponse.json({ error: "記録の種類が不正です" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

  try {
    const prev = await fetchRecord(auth.admin, kind, id);
    if (!prev) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }
    const next = buildRecord(kind, id, body, prev);
    if (!next) return NextResponse.json({ error: REQUIRED_MESSAGE[kind] }, { status: 400 });
    const problem = validateRecord(next);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (next.kind !== "period" && prev.kind !== "period") {
      if (
        next.record.periodId !== prev.record.periodId &&
        !(await periodExists(auth, next.record.periodId))
      ) {
        return NextResponse.json({ error: "その期は存在しません" }, { status: 400 });
      }
    }

    const by = auth.userEmail || auth.userId;
    await saveRecord(auth.admin, next, by, false);
    const changes = buildRecordChanges(prev, next);
    if (changes.length > 0) {
      await recordRetrospectiveLog(auth.admin, {
        by,
        action: "更新",
        kind: KIND_LABEL[next.kind],
        target: recordTitle(next),
        changes,
      });
    }
    return NextResponse.json(next);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();

  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id") ?? "";
  if (!isRecordKind(kind)) {
    return NextResponse.json({ error: "記録の種類が不正です" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });

  try {
    // 消す前に読み、独立した操作ログとして残す（記録ごと消えないように）
    const prev = await fetchRecord(auth.admin, kind, id);
    if (!prev) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }
    const deleted = await deleteRecordCascade(auth.admin, kind, id);
    await recordRetrospectiveLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: KIND_LABEL[kind],
      target: recordTitle(prev),
      changes:
        kind === "period"
          ? [{ field: "まとめて削除した記録", before: "", after: `${deleted}件` }]
          : buildRecordChanges(null, prev),
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return errorResponse(e);
  }
}
