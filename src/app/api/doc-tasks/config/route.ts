// 書類進捗ボードの設定API（指示書154 / 154-2）— **管理者のみ**
//   PUT → 閲覧できる人・アラートを受け取る人・**通知先メールアドレス（155）**・
//         滞留とみなす日数（種別ごと）・主治医の選択肢
// 非許可・未ログイン・非管理者にはすべて 404（存在秘匿）。
//
// ロックアウト防止: 閲覧者リストの保存時は「操作している管理者自身」を必ず含める（149と同じ）。

import { NextResponse } from "next/server";
import {
  authorizeDocTasks,
  recordDocTaskLog,
  saveDocTasksConfig,
  DocTasksTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/doc-tasks-server";
import {
  normalizeDocTasksConfig,
  type DocTasksConfig,
} from "@/lib/doc-tasks";
import {
  saveMenuAllowedUserIds,
  saveMenuScope,
} from "@/lib/menu-access-server";
import {
  MENU_DOC_TASKS,
  MENU_SCOPE_EVERYONE,
  MENU_SCOPE_LISTED,
  scopeLabel,
} from "@/lib/menu-access";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

// 157: 設定画面（管理画面）が読む。記録は返さない＝設定だけを扱う口
export async function GET() {
  const auth = await authorizeDocTasks();
  if (!auth.ok || !auth.isAdmin) return hidden();
  // 159-A: 公開範囲は menu_access 側にあるので併せて返す
  return NextResponse.json({ config: auth.config, scope: auth.scope });
}

export async function PUT(req: Request) {
  const auth = await authorizeDocTasks();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  // 送られたキーだけを差し替える（部分更新）。値の検証は normalize に一任
  const merged = normalizeDocTasksConfig({
    ...auth.config,
    ...("viewerUserIds" in body ? { viewerUserIds: body.viewerUserIds } : {}),
    ...("notifyUserIds" in body ? { notifyUserIds: body.notifyUserIds } : {}),
    ...("notifyEmails" in body ? { notifyEmails: body.notifyEmails } : {}),
    ...("thresholdDays" in body ? { thresholdDays: body.thresholdDays } : {}),
    ...("doctors" in body ? { doctors: body.doctors } : {}),
  });

  // 自分を必ず含める（設定した本人が締め出される事故を防ぐ）
  const config: DocTasksConfig = {
    ...merged,
    viewerUserIds: merged.viewerUserIds.includes(auth.userId)
      ? merged.viewerUserIds
      : [...merged.viewerUserIds, auth.userId],
  };

  // 159-A: 公開範囲。**"everyone" と明示されたときだけ**全員にする。
  // 送られてこなければ今の値のまま（他の設定を保存しただけで範囲が変わらないように）。
  const nextScope =
    "scope" in body
      ? body.scope === MENU_SCOPE_EVERYONE
        ? MENU_SCOPE_EVERYONE
        : MENU_SCOPE_LISTED
      : auth.scope;

  try {
    const by = auth.userEmail || auth.userId;
    // 158: 指名リストの保存先は menu_access だけ。
    // 旧 clinic_doc_tasks 側の viewerUserIds には**二度と書かない**（常に空で保存する）。
    // 真実の在り処を1つにするため。他の設定（主治医・滞留日数・送信先・通知メンバー）は従来どおり。
    if ("viewerUserIds" in body) {
      await saveMenuAllowedUserIds(MENU_DOC_TASKS, config.viewerUserIds, by);
    }
    if ("scope" in body && nextScope !== auth.scope) {
      await saveMenuScope(MENU_DOC_TASKS, nextScope, by);
      // 159-B: 公開範囲の変更そのものを操作ログに残す（誰がいつ開けたか）
      await recordDocTaskLog(auth.admin, {
        by,
        action: "設定変更",
        chartNo: "",
        docType: "",
        changes: [
          {
            field: "このボードを開ける人",
            before: scopeLabel(auth.scope),
            after: scopeLabel(nextScope),
          },
        ],
      });
    }
    await saveDocTasksConfig(auth.admin, { ...config, viewerUserIds: [] }, by);
    return NextResponse.json({ ok: true, config, scope: nextScope });
  } catch (e) {
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
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
}
