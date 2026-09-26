// 入職予定者API（指示書187 C）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET → { prospects, tableMissing }（紐づけ候補は育成カルテ一覧の API が付ける）
//   POST { name, email?, expectedJoinOn?, memo? } → 登録（**内定後のみ**。選考中の応募者は登録しない）
//   PATCH { id, name?, email?, expectedJoinOn?, memo? }       → 項目の修正
//   PATCH { id, action: "link", userId }                      → アカウントに紐づける（院長の操作で初めて紐づく・自動では紐づけない）
//   PATCH { id, action: "decline" }                            → 「入職しなかった」を付ける（削除の案内を出す。自動削除はしない）
//   DELETE { id }                                              → 関連情報（連絡先・採用資料・経歴）をまとめて削除（院長の確認後・declined のときだけ）

import { NextRequest, NextResponse } from "next/server";
import {
  HiringTableMissingError,
  ServiceRoleMissingError,
  authorizeHiring,
  deleteHiringDataOfUser,
  deleteProspectRow,
  fetchProspect,
  fetchProspects,
  findAccountsByEmail,
  moveHiringDataToUser,
  newHiringId,
  recordHiringLog,
  saveProspect,
} from "@/lib/hiring-docs-server";
import { PROSPECT_PREFIX, normalizeProspect } from "@/lib/hiring-docs";
import { deleteScouterResultsOfUser, moveScouterResultsToUser } from "@/lib/scouter-server";
import {
  authorizeStaffContacts,
  deleteStaffContactRow,
  fetchAllStaffContacts,
  recordStaffContactLog,
  saveStaffContactRow,
  staffContactSnapshot,
} from "@/lib/staff-contacts-server";
import { normalizeStaffContact } from "@/lib/staff-contacts";

export const runtime = "nodejs";

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
    const { prospects, tableMissing } = await fetchProspects(auth.admin);
    return NextResponse.json({ prospects, tableMissing });
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
  const now = new Date().toISOString();
  const p = normalizeProspect(newHiringId(PROSPECT_PREFIX.slice(0, -1)), { ...body, status: "expected", linkedUserId: "", createdAt: now, updatedAt: now });
  if (!p) return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
  try {
    const by = auth.userEmail || auth.userId;
    await saveProspect(auth.admin, p, by);
    await recordHiringLog(auth.admin, { by, action: "入職予定者を登録", target: p.id, changes: [{ field: "入職予定日", before: "", after: p.expectedJoinOn || "未設定" }] });
    return NextResponse.json({ prospect: p });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  const by = auth.userEmail || auth.userId;
  const now = new Date().toISOString();
  try {
    const prev = await fetchProspect(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });

    if (body.action === "link") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) return NextResponse.json({ error: "紐づけるアカウントが指定されていません" }, { status: 400 });
      if (prev.status === "linked") return NextResponse.json({ error: "すでに紐づけ済みです" }, { status: 400 });
      // 候補（有効なアカウント）に実在することを確かめる（任意のIDへは付け替えない）
      const accounts = await findAccountsByEmail(auth.admin, prev.email ? [prev.email] : []);
      const byEmail = prev.email ? accounts.get(prev.email) : undefined;
      let verified = byEmail?.userId === userId;
      if (!verified) {
        try {
          const { data } = await auth.admin.auth.admin.getUserById(userId);
          verified = !!data?.user;
        } catch {
          verified = false;
        }
      }
      if (!verified) return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 400 });

      // 採用資料・経歴を付け替える
      const moved = await moveHiringDataToUser(auth.admin, prev.id, userId, by);
      const movedScouter = await moveScouterResultsToUser(auth.admin, prev.id, userId, by); // 188
      // 連絡先（169）を付け替える。相手に既に連絡先があれば空の欄だけ埋めて、入職予定者側の行は消す
      let contactMoved = false;
      const ca = await authorizeStaffContacts();
      if (ca.ok && ca.isAdmin) {
        const { contacts, tableMissing } = await fetchAllStaffContacts(ca.admin);
        if (!tableMissing) {
          const src = contacts.find((c) => c.userId === prev.id);
          const dst = contacts.find((c) => c.userId === userId);
          if (src && !dst) {
            const next = normalizeStaffContact(src.id, { ...src, userId, updatedAt: now });
            if (next) {
              await saveStaffContactRow(ca.admin, next, by, false);
              contactMoved = true;
            }
          } else if (src && dst) {
            const merged = { ...dst } as Record<string, unknown>;
            for (const k of ["kana", "address", "phoneMobile", "phoneHome", "privateEmail", "birthday", "joinedOn", "memo"] as const) {
              if (!dst[k] && src[k]) merged[k] = src[k];
            }
            merged.emergency = [...dst.emergency, ...src.emergency].slice(0, 3);
            merged.family = [...dst.family, ...src.family].slice(0, 6);
            const next = normalizeStaffContact(dst.id, { ...merged, updatedAt: now });
            if (next) {
              await saveStaffContactRow(ca.admin, next, by, false);
              await deleteStaffContactRow(ca.admin, src.id);
              contactMoved = true;
            }
          }
          if (contactMoved) {
            await recordStaffContactLog(ca.admin, { by, action: "更新（入職予定者からアカウントへ紐づけ）", target: prev.name, changes: [{ field: "アカウントの紐付け", before: "なし", after: "あり" }] });
          }
        }
      }
      const next = { ...prev, status: "linked" as const, linkedUserId: userId, updatedAt: now };
      await saveProspect(auth.admin, next, by);
      await recordHiringLog(auth.admin, {
        by,
        action: "アカウントに紐づけ",
        target: userId,
        changes: [
          { field: "採用資料", before: "", after: `${moved.docs}件` },
          { field: "経歴", before: "", after: moved.profile ? "移動" : "なし" },
          { field: "検査結果", before: "", after: `${movedScouter}件` },
          { field: "連絡先", before: "", after: contactMoved ? "移動" : "なし" },
        ],
      });
      return NextResponse.json({ prospect: next, moved: { ...moved, contact: contactMoved } });
    }

    if (body.action === "decline") {
      const next = { ...prev, status: "declined" as const, updatedAt: now };
      await saveProspect(auth.admin, next, by);
      await recordHiringLog(auth.admin, { by, action: "入職しなかった", target: prev.id, changes: [] });
      return NextResponse.json({ prospect: next });
    }

    const next = normalizeProspect(id, { ...prev, ...body, status: prev.status, linkedUserId: prev.linkedUserId, createdAt: prev.createdAt, updatedAt: now });
    if (!next) return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
    await saveProspect(auth.admin, next, by);
    return NextResponse.json({ prospect: next });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const prev = await fetchProspect(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    // まとめて削除は「入職しなかった」を付けた人だけ（誤操作で入職予定者の資料を消さない）
    if (prev.status !== "declined") return NextResponse.json({ error: "先に「入職しなかった」を付けてください" }, { status: 400 });
    const by = auth.userEmail || auth.userId;
    const { docs } = await deleteHiringDataOfUser(auth.admin, prev.id);
    const scouter = await deleteScouterResultsOfUser(auth.admin, prev.id); // 188
    let contactDeleted = false;
    const ca = await authorizeStaffContacts();
    if (ca.ok && ca.isAdmin) {
      const { contacts, tableMissing } = await fetchAllStaffContacts(ca.admin);
      const c = tableMissing ? undefined : contacts.find((x) => x.userId === prev.id);
      if (c) {
        await deleteStaffContactRow(ca.admin, c.id);
        await recordStaffContactLog(ca.admin, { by, action: "削除（入職しなかった入職予定者）", target: c.name, changes: staffContactSnapshot(c) });
        contactDeleted = true;
      }
    }
    await deleteProspectRow(auth.admin, prev.id);
    await recordHiringLog(auth.admin, {
      by,
      action: "入職予定者の関連情報を削除",
      target: prev.id,
      changes: [
        { field: "採用資料", before: `${docs}件`, after: "0件" },
        { field: "検査結果", before: `${scouter}件`, after: "0件" },
        { field: "連絡先", before: contactDeleted ? "あり" : "なし", after: "なし" },
      ],
    });
    return NextResponse.json({ ok: true, deleted: { docs, contact: contactDeleted } });
  } catch (e) {
    return errorResponse(e);
  }
}
