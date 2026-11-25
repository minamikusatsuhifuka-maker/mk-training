// スタッフ連絡先API（指示書169）
// 非許可ユーザー・未ログインには **すべて 404**（住所・電話番号を扱うため機能の存在も伏せる）。
//   GET    ?probe=1 → { ok:true }（ナビのリンク判定用・中身は返さない）
//   GET             → { contacts, retiredUserIds, isAdmin, tableMissing }
//   POST            → 新規登録（**管理者のみ**）
//   PATCH           → 1件更新（**管理者のみ**）
//   DELETE ?id=     → 1件を物理削除（**管理者のみ**）
//
// 【編集を管理者に限る理由（169-1-3）】
// 連絡先は人事情報で、誤って書き換えられると本人に連絡が取れなくなる。
// 閲覧が必要な人と、編集してよい人は別である。指名された人は**閲覧のみ**。
//
// 実体アクセスはすべて service-role（RLS全拒否テーブル）。

import { NextResponse } from "next/server";
import { loadTestSeedIds } from "@/lib/test-seed-server";
import {
  authorizeStaffContacts,
  fetchAllStaffContacts,
  fetchStaffContactRow,
  saveStaffContactRow,
  deleteStaffContactRow,
  buildStaffContactChanges,
  staffContactSnapshot,
  recordStaffContactLog,
  loadRetiredUserIds,
  StaffContactsTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/staff-contacts-server";
import {
  normalizeStaffContact,
  withoutFamily,
  type StaffContact,
} from "@/lib/staff-contacts";

export const runtime = "nodejs";

// 存在を悟らせないため、Next の標準的な 404 と同じ形にする
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof StaffContactsTableMissingError) {
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

function genId(): string {
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 送られてきた内容を1件の連絡先に整える。
 * 値の検証・切り詰めは normalizeStaffContact に一任する（クライアントの値を信じない）。
 * 2-3の「保存しないもの」は型に無いので、余分なキーはここで落ちる。
 *
 * 更新のときは **送られてきた項目だけを差し替える**（base の上に body を重ねる）。
 * 全置換にすると、項目が1つ欠けたリクエストで住所や電話番号が黙って消える。
 * 「誤って書き換えられると本人に連絡が取れなくなる」（169-1-3）のが
 * 編集を管理者に限る理由なので、消える方向の事故は仕組みで塞いでおく。
 */
function buildContact(
  id: string,
  body: Record<string, unknown>,
  base: StaffContact | null
): StaffContact | null {
  const now = new Date().toISOString();
  return normalizeStaffContact(id, {
    ...(base ?? {}),
    ...body,
    createdAt: base?.createdAt || now,
    updatedAt: now,
  });
}

export async function GET(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) return hidden();

  const probe = new URL(req.url).searchParams.get("probe") === "1";
  // ナビのリンク判定用。**中身は一切返さない**（開けるかどうかだけ）
  if (probe) return NextResponse.json({ ok: true });

  // 188 5: 名前の横の連絡先（小窓）。1人分だけ返す。権限判定は上と同じ（院長・指名された閲覧者）
  const one = new URL(req.url).searchParams.get("user") ?? "";
  if (one) {
    try {
      const { contacts, tableMissing } = await fetchAllStaffContacts(auth.admin);
      // 237: 院長でも検証用でもない閲覧者には、検証用アカウントの連絡先を「無い」ことにする
      const hideTest = !auth.isAdmin && !auth.testSeed;
      const testIds = hideTest ? await loadTestSeedIds() : new Set<string>();
      const c = testIds.has(one) ? null : contacts.find((x) => x.userId === one) ?? null;
      return NextResponse.json({ contact: c ? (auth.isAdmin ? c : withoutFamily(c)) : null, tableMissing });
    } catch (e) {
      return errorResponse(e);
    }
  }

  try {
    const [{ contacts: allContacts, tableMissing }, retiredUserIds, seedIds] = await Promise.all([
      fetchAllStaffContacts(auth.admin),
      loadRetiredUserIds(auth.admin),
      loadTestSeedIds(),
    ]);
    // 237: 院長でも検証用でもない閲覧者（指名された本物のスタッフ）には、検証用アカウントの連絡先を渡さない
    const hideTest = !auth.isAdmin && !auth.testSeed;
    const contacts = hideTest ? allContacts.filter((c) => !seedIds.has(c.userId)) : allContacts;
    // 無効化アカウントの一覧をそのまま渡さない。
    // 画面が必要とするのは「この連絡先が退職者かどうか」だけなので、
    // 連絡先に紐付いているIDだけに絞る（無関係なアカウントの状態を配らない）。
    const linked = new Set(contacts.map((c) => c.userId).filter(Boolean));
    // 179 D: 家族構成（本人申告）は**管理者のみ**。169で指名された閲覧者には渡す前に落とす
    //（見せない判断は見せる場所ではなく渡す前に行う・164と同じ）
    const visible = auth.isAdmin ? contacts : contacts.map(withoutFamily);
    return NextResponse.json({
      contacts: visible,
      retiredUserIds: retiredUserIds.filter((id) => linked.has(id)),
      // 191: 検証用アカウントの連絡先に印を付ける（院長の画面）
      testUserIds: Array.from(seedIds).filter((id) => linked.has(id)),
      isAdmin: auth.isAdmin,
      tableMissing,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) return hidden();
  // 第5便: 登録・修正は、管理者と「編集も任せる」で指名された人（削除と家族構成は今までどおり管理者だけ）
  if (!auth.canEdit) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  // 第6便: 家族構成（179 D）は管理者以外に**見せていない**ので、書かせもしない。
  // 指名された編集者のフォームには家族欄が無いが、送られてきても落とす（クライアントを信じない）。
  if (!auth.isAdmin) delete body.family;

  const contact = buildContact(genId(), body, null);
  if (!contact) {
    return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
  }

  try {
    // 同じアカウントに2件目を作らない（どちらが正しいか分からなくなるため）
    if (contact.userId) {
      const { contacts } = await fetchAllStaffContacts(auth.admin);
      if (contacts.some((c) => c.userId === contact.userId)) {
        return NextResponse.json(
          { error: "そのアカウントの連絡先はすでに登録されています" },
          { status: 400 }
        );
      }
    }

    const by = auth.userEmail || auth.userId;
    await saveStaffContactRow(auth.admin, contact, by, true);
    await recordStaffContactLog(auth.admin, {
      by,
      action: "登録",
      target: contact.name,
      changes: staffContactSnapshot(contact),
    });
    // 家族構成は管理者以外に返さない（GETと同じ基準で渡す前に落とす）
    return NextResponse.json({ contact: auth.isAdmin ? contact : withoutFamily(contact) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) return hidden();
  // 第5便: 修正も、管理者と「編集も任せる」の指名の人（削除は管理者のみのまま）
  if (!auth.canEdit) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  // 第6便: 管理者以外は家族構成を受け取らない。GETで家族を落とした値がそのまま
  // 送り返されると {...base, ...body} の重ね合わせで**保存済みの家族が消える**ため、
  // ここで落として base（保存済み）の家族を守る。
  if (!auth.isAdmin) delete body.family;

  try {
    const prev = await fetchStaffContactRow(auth.admin, id);
    if (!prev) {
      return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    }
    const next = buildContact(id, body, prev);
    if (!next) {
      return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
    }
    if (next.userId && next.userId !== prev.userId) {
      const { contacts } = await fetchAllStaffContacts(auth.admin);
      if (contacts.some((c) => c.id !== id && c.userId === next.userId)) {
        return NextResponse.json(
          { error: "そのアカウントの連絡先はすでに登録されています" },
          { status: 400 }
        );
      }
    }

    const by = auth.userEmail || auth.userId;
    await saveStaffContactRow(auth.admin, next, by, false);
    const changes = buildStaffContactChanges(prev, next);
    if (changes.length > 0) {
      await recordStaffContactLog(auth.admin, {
        by,
        action: "更新",
        target: next.name,
        changes,
      });
    }
    return NextResponse.json({ contact: auth.isAdmin ? next : withoutFamily(next) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  try {
    // 消す前に読み、独立した操作ログとして残す（記録ごと消えないように）
    const prev = await fetchStaffContactRow(auth.admin, id);
    await deleteStaffContactRow(auth.admin, id);
    if (prev) {
      await recordStaffContactLog(auth.admin, {
        by: auth.userEmail || auth.userId,
        action: "削除",
        target: prev.name,
        changes: staffContactSnapshot(prev),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
