// 院長の四象限マトリクスのサーバー共通部（指示書201 → 202で改修・サーバー専用）
//
// 【保護】
//   実体は既存の private_store（RLS有効＋ポリシー無し＝anon/authenticated とも全拒否）。
//   読み書きは service-role を持つこのファイル経由だけ。
//   入口は /api/admin/priority-matrix のみで、requireAdmin（app_metadata.role === "admin"）を通す。
//   非管理者には proxy.ts が /api/admin 配下を「実在しないAPIと同じ応答」に rewrite する（159-D）。
//   画面 /admin/priority-matrix も admin/layout.tsx と proxy が管理者以外を404にする（158）。
//   183の委任対象外（🔒）＝ admin-items.ts で delegable: false にしてあるので幹部にも開かない。
//
// 【汎用の /api/private-store には content_type を足さない】
//   足すと「ログイン済みなら誰でも自分名義のレコードを作れる口」ができる。
//   201 A の「院長のみ・スタッフの画面には一切出さない」を守るため、ここだけから触る。
//
// 【owner_id で院長本人に閉じる】
//   記録は院長の持ち物。owner_id＝セッションの userId で必ず絞る。
//   リクエストから owner を受け取る口は作らない（他人のマトリクスを覗く経路を作らない）。
//
// 【202 §0: 保存の失敗を黙って飲み込まない】
//   201では「保存したのに件数が増えない」が起きた。原因が何であっても次からは必ず分かるよう、
//   ここでは **(1) DBのエラーを種類（Postgresのコード）ごと文言にする**
//          **(2) 書いた直後に読み戻して、本当に入ったかを確かめる**（入っていなければエラー）
//   の2つを必ず通す。書けたことにして画面を閉じる経路を残さない。
//
// 【操作ログは本文を残さない（201 F）】
//   action・id・象限だけ。タイトル・メモ・9マスの本文は書かない。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import {
  FOCUS_MAX,
  normalizeLog,
  normalizeRecord,
  type GridBook,
  type MatrixLog,
  type MatrixRecord,
  type PriorityTask,
  type Quadrant,
} from "./priority-matrix";

export { ServiceRoleMissingError };

export const PM_TABLE = "private_store";
/**
 * 1レコード＝「四象限の項目」1件 または「9マス帳」1冊（record_key＝そのid）。
 * **201から content_type を増やしていない**。種類は data.kind で分ける（202 §5）。
 */
export const PM_CONTENT_TYPE = "priority_matrix";
/** 操作ログ1件＝1レコード（本文は入れない） */
export const PM_LOG_CONTENT_TYPE = "priority_matrix_log";

export type MatrixAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function priorityMatrixAdmin(): MatrixAdminClient {
  return createSupabaseAdminClient();
}

type StoreRow = {
  record_key: string;
  data: unknown;
  updated_at?: string;
  created_at?: string;
};

/** 四象限の項目のid */
export function newTaskId(): string {
  return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 9マス帳のid（見ただけで種類が分かるように接頭辞を変える） */
export function newBookId(): string {
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── DBのエラーを「何が起きたか分かる文言」にする（202 §0-3・§0-4） ───

/** Postgres／PostgREST が返したエラーを持ち回る。route.ts が文言と状態コードを決める */
export class MatrixDbError extends Error {
  /** Postgres のエラーコード（例: 23514＝CHECK制約違反・42501＝RLS・42P10＝ON CONFLICT不一致） */
  pgCode: string;
  /** どの操作で起きたか（画面に出す） */
  operation: string;
  constructor(operation: string, message: string, pgCode: string) {
    super(message);
    this.name = "MatrixDbError";
    this.operation = operation;
    this.pgCode = pgCode;
  }
}

type SupabaseError = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };

/** supabase-js のエラーを MatrixDbError に変える（コードを落とさない） */
function dbError(operation: string, error: unknown): MatrixDbError {
  const e = (error ?? {}) as SupabaseError;
  const code = typeof e.code === "string" ? e.code : "";
  const parts = [typeof e.message === "string" ? e.message : "原因不明のエラー"];
  if (typeof e.details === "string" && e.details) parts.push(e.details);
  if (typeof e.hint === "string" && e.hint) parts.push(e.hint);
  return new MatrixDbError(operation, parts.join(" / "), code);
}

/**
 * MatrixDbError を院長が読める文言にする。
 * **原因の種類が分かるコードを必ず添える**（報告してもらえば、こちらで何をすべきか即分かる）。
 */
export function describeDbError(e: MatrixDbError): string {
  const tail = e.pgCode ? `［${e.pgCode}］${e.message}` : e.message;
  switch (e.pgCode) {
    case "23514":
      return `${e.operation}できませんでした。保存先（private_store）の制限に引っかかっています。交付したSQL（202_private_store_content_type.sql）を実行してください。${tail}`;
    case "42501":
      return `${e.operation}できませんでした。保存先の権限（RLS）で止まっています。サーバーの鍵（SUPABASE_SERVICE_ROLE_KEY）の設定を確かめてください。${tail}`;
    case "42P10":
      return `${e.operation}できませんでした。保存先の一意制約（owner_id, content_type, record_key）が見つかりません。${tail}`;
    case "42703":
    case "PGRST204":
      return `${e.operation}できませんでした。保存先に必要な列がありません。${tail}`;
    case "23502":
      return `${e.operation}できませんでした。保存先で必須の値が空です。${tail}`;
    default:
      return `${e.operation}できませんでした。${tail}`;
  }
}

// ─── 読み取り ───

async function selectRows(
  admin: MatrixAdminClient,
  ownerId: string
): Promise<StoreRow[]> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE);
  if (error) throw dbError("読み込み", error);
  return (data ?? []) as StoreRow[];
}

/** 四象限の項目と9マス帳をまとめて読む（1回のクエリ・kind で振り分ける） */
export async function fetchRecords(
  admin: MatrixAdminClient,
  ownerId: string
): Promise<{ tasks: PriorityTask[]; books: GridBook[] }> {
  const rows = await selectRows(admin, ownerId);
  const tasks: PriorityTask[] = [];
  const books: GridBook[] = [];
  for (const r of rows) {
    const rec = normalizeRecord(r.record_key, r.data);
    if (!rec) continue;
    if (rec.kind === "book") books.push(rec);
    else tasks.push(rec);
  }
  return { tasks, books };
}

/** 四象限の項目だけ（★の上限・並び順の計算に使う） */
export async function fetchTasks(
  admin: MatrixAdminClient,
  ownerId: string
): Promise<PriorityTask[]> {
  return (await fetchRecords(admin, ownerId)).tasks;
}

export async function fetchRecord(
  admin: MatrixAdminClient,
  ownerId: string,
  id: string
): Promise<MatrixRecord | null> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE)
    .eq("record_key", id)
    .maybeSingle();
  if (error) throw dbError("読み込み", error);
  if (!data) return null;
  const row = data as StoreRow;
  return normalizeRecord(row.record_key, row.data);
}

// ─── 書き込み（書いたら必ず読み戻して確かめる・202 §0） ───

/**
 * 1件を保存（upsert）し、**読み戻して本当に入ったかを確かめる**。
 * id は record_key に入れるので data からは外す。kind は data に残す（種類の判定に使う）。
 */
export async function saveRecord(
  admin: MatrixAdminClient,
  ownerId: string,
  record: MatrixRecord,
  operation = "保存"
): Promise<void> {
  const { id, ...data } = record;
  const { error } = await admin.from(PM_TABLE).upsert(
    {
      owner_id: ownerId,
      content_type: PM_CONTENT_TYPE,
      record_key: id,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,content_type,record_key" }
  );
  if (error) throw dbError(operation, error);

  // 書けたと言われても、読み戻せなければ「保存できた」とは言わない（201の再発防止）
  const back = await fetchRecord(admin, ownerId, id);
  if (!back) {
    throw new MatrixDbError(
      operation,
      "保存した直後に読み戻せませんでした（保存先に行が入っていません）",
      "readback_missing"
    );
  }
  if (back.updatedAt !== record.updatedAt) {
    throw new MatrixDbError(
      operation,
      "保存した直後に読み戻した内容が一致しませんでした",
      "readback_mismatch"
    );
  }
}

/**
 * 1件を物理削除し、**消えたことを読み戻して確かめる**。
 * 9マスから四象限へ出した項目（リンク先）は消さない。代わりに、元のマスに残っている
 * リンクを外す（消えた項目へのリンクが画面に残らないように）。
 */
export async function deleteRecordRow(
  admin: MatrixAdminClient,
  ownerId: string,
  id: string
): Promise<void> {
  const { error } = await admin
    .from(PM_TABLE)
    .delete()
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE)
    .eq("record_key", id);
  if (error) throw dbError("削除", error);
  const back = await fetchRecord(admin, ownerId, id);
  if (back) {
    throw new MatrixDbError("削除", "削除した直後にまだ残っていました", "readback_remains");
  }
}

/** 消した項目へのリンクを、他の記録の9マス（どの段でも）から外す */
export async function clearLinksTo(
  admin: MatrixAdminClient,
  ownerId: string,
  deletedId: string
): Promise<void> {
  const { tasks, books } = await fetchRecords(admin, ownerId);
  for (const rec of [...tasks, ...books] as MatrixRecord[]) {
    let touched = false;
    const strip = (cells: MatrixRecord["cells"]): MatrixRecord["cells"] =>
      cells.map((c) => {
        const children = c.children.length > 0 ? strip(c.children) : c.children;
        if (c.linkedTaskId === deletedId) {
          touched = true;
          return { ...c, linkedTaskId: "", children };
        }
        return children === c.children ? c : { ...c, children };
      });
    const cells = strip(rec.cells);
    if (!touched) continue;
    await saveRecord(
      admin,
      ownerId,
      { ...rec, cells, updatedAt: new Date().toISOString() } as MatrixRecord,
      "リンクの整理"
    );
  }
}

/**
 * ★（注力）を付けられるか（201 C-3: 同時に3件まで）。
 * 自分自身は数に入れない（すでに★の項目を編集しても引っかからないように）。
 */
export async function canAddFocus(
  admin: MatrixAdminClient,
  ownerId: string,
  selfId: string
): Promise<boolean> {
  const tasks = await fetchTasks(admin, ownerId);
  const others = tasks.filter((t) => t.focus && t.id !== selfId).length;
  return others < FOCUS_MAX;
}

// ─── 操作ログ（本文は残さない） ───

/** 1件記録する。記録に失敗しても業務は止めない（サーバーログには残す） */
export async function recordMatrixLog(
  admin: MatrixAdminClient,
  ownerId: string,
  entry: { by: string; action: string; taskId: string; quadrant: Quadrant | 0 }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    const { error } = await admin.from(PM_TABLE).upsert(
      {
        owner_id: ownerId,
        content_type: PM_LOG_CONTENT_TYPE,
        record_key: newLogId(),
        data: { at, ...entry },
        updated_at: at,
      },
      { onConflict: "owner_id,content_type,record_key" }
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(
      "[priority-matrix] 操作ログを記録できませんでした:",
      e instanceof Error ? e.message : e
    );
  }
}

export async function fetchMatrixLogs(
  admin: MatrixAdminClient,
  ownerId: string,
  limit: number
): Promise<MatrixLog[]> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_LOG_CONTENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError("操作の記録の読み込み", error);
  return ((data ?? []) as StoreRow[])
    .map((r) => normalizeLog(r.record_key, r.data))
    .filter((l): l is MatrixLog => l !== null);
}

// ─── 保存の点検（202 §0-1: 本番で原因をその場で名指しする） ───

export type SelfTestStep = { name: string; ok: boolean; detail: string };

/**
 * 「書ける／読み戻せる／消せる」を使い捨てのレコードで確かめる。
 * 院長が画面のボタンから呼ぶ。失敗した段と Postgres のコードを返すので、
 * 201のような「保存したのに出ない」が起きても**画面の文言だけで原因が分かる**。
 * 途中で失敗しても、作ってしまった行は必ず片付ける。
 */
export async function runSelfTest(
  admin: MatrixAdminClient,
  ownerId: string
): Promise<{ ok: boolean; steps: SelfTestStep[] }> {
  const steps: SelfTestStep[] = [];
  const probeKey = `pm-selftest-${Date.now()}`;
  const at = new Date().toISOString();
  let wrote = false;

  const push = (name: string, ok: boolean, detail: string) => {
    steps.push({ name, ok, detail });
    return ok;
  };

  try {
    const { error } = await admin.from(PM_TABLE).upsert(
      {
        owner_id: ownerId,
        content_type: PM_CONTENT_TYPE,
        record_key: probeKey,
        data: { kind: "task", title: "点検用（すぐ消します）", quadrant: 2, updatedAt: at },
        updated_at: at,
      },
      { onConflict: "owner_id,content_type,record_key" }
    );
    if (error) {
      const de = dbError("書き込み", error);
      push("保存先に書ける", false, describeDbError(de));
      return { ok: false, steps };
    }
    wrote = true;
    push("保存先に書ける", true, `content_type=${PM_CONTENT_TYPE} で1件書けました`);

    const { data, error: readErr } = await admin
      .from(PM_TABLE)
      .select("record_key, data")
      .eq("owner_id", ownerId)
      .eq("content_type", PM_CONTENT_TYPE)
      .eq("record_key", probeKey)
      .maybeSingle();
    if (readErr) {
      push("書いた直後に読み戻せる", false, describeDbError(dbError("読み戻し", readErr)));
      return { ok: false, steps };
    }
    if (!data) {
      push(
        "書いた直後に読み戻せる",
        false,
        "書き込みはエラーにならなかったのに、同じ条件で読み戻せませんでした（これが201の症状と同じ形です）"
      );
      return { ok: false, steps };
    }
    push("書いた直後に読み戻せる", true, "owner_id・content_type で絞って読み戻せました");

    const parsed = normalizeRecord(probeKey, (data as StoreRow).data);
    push(
      "読み戻した内容が画面の形に直せる",
      !!parsed,
      parsed
        ? "タイトルを取り出せました"
        : "読み戻した data からタイトルを取り出せませんでした（data 列の型が JSON でない可能性）"
    );
  } catch (e) {
    push(
      "点検",
      false,
      e instanceof MatrixDbError ? describeDbError(e) : e instanceof Error ? e.message : "原因不明"
    );
  } finally {
    if (wrote) {
      const { error } = await admin
        .from(PM_TABLE)
        .delete()
        .eq("owner_id", ownerId)
        .eq("content_type", PM_CONTENT_TYPE)
        .eq("record_key", probeKey);
      push(
        "点検用の行を片付けた",
        !error,
        error ? describeDbError(dbError("片付け", error)) : "消しました"
      );
    }
  }

  return { ok: steps.every((s) => s.ok), steps };
}
