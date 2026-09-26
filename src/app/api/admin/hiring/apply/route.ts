// AIの提案の反映（指示書184 3-1 ③④）— **院長のみ**
//   POST HiringApplyInput → 院長が「反映する」を選んだ項目だけを、既存のAPIと同じ経路で保存する
//     連絡先・緊急連絡先・家族構成 → clinic_staff_contacts（169の保存関数と操作ログ）
//     経歴・入職時の想い            → clinic_hiring_docs の profile 行
//   送られてこなかった項目は触らない。既存の値の扱い（置換／追記）は院長が項目ごとに選ぶ。
//   受け取りは normalizeHiringApply（ホワイトリスト＋禁止語の行落とし）を通す＝3-3の項目は保存できない。

import { NextRequest, NextResponse } from "next/server";
import {
  HiringTableMissingError,
  ServiceRoleMissingError,
  authorizeHiring,
  fetchHiringProfile,
  recordHiringLog,
  saveHiringProfile,
} from "@/lib/hiring-docs-server";
import {
  authorizeStaffContacts,
  buildStaffContactChanges,
  fetchAllStaffContacts,
  recordStaffContactLog,
  saveStaffContactRow,
  staffContactSnapshot,
} from "@/lib/staff-contacts-server";
import { EMERGENCY_MAX, FAMILY_MAX, normalizeStaffContact, type StaffContact } from "@/lib/staff-contacts";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import { HIRING_PROFILE_FIELDS, mergeText, normalizeHiringApply } from "@/lib/hiring-docs";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const input = normalizeHiringApply(raw);
  if (!input) return NextResponse.json({ error: "対象のスタッフが指定されていません" }, { status: 400 });
  const by = auth.userEmail || auth.userId;
  const applied: string[] = [];

  try {
    // ── 連絡先・緊急連絡先・家族構成（169の経路） ──
    if (input.contact || (input.emergency && input.emergency.length > 0) || (input.family && input.family.length > 0)) {
      const ca = await authorizeStaffContacts();
      if (!ca.ok || !ca.isAdmin) return hidden();
      const { contacts, tableMissing } = await fetchAllStaffContacts(ca.admin);
      if (tableMissing) {
        return NextResponse.json(
          { error: "スタッフ連絡先のテーブルがまだ作られていません（169のSQL）。連絡先への反映はできません" },
          { status: 503 }
        );
      }
      const prev = contacts.find((c) => c.userId === input.userId) ?? null;
      const now = new Date().toISOString();
      let baseName = prev?.name ?? input.contact?.name ?? "";
      if (!baseName) {
        baseName = (await loadProfilesIndexServer()).find((p) => p.userId === input.userId)?.name ?? "";
      }
      const merged = {
        ...(prev ?? {}),
        userId: input.userId,
        name: input.contact?.name ?? baseName,
        ...(input.contact?.kana !== undefined ? { kana: input.contact.kana } : {}),
        ...(input.contact?.birthday !== undefined ? { birthday: input.contact.birthday } : {}),
        ...(input.contact?.address !== undefined ? { address: input.contact.address } : {}),
        ...(input.contact?.phoneMobile !== undefined ? { phoneMobile: input.contact.phoneMobile } : {}),
        ...(input.contact?.phoneHome !== undefined ? { phoneHome: input.contact.phoneHome } : {}),
        ...(input.contact?.privateEmail !== undefined ? { privateEmail: input.contact.privateEmail } : {}),
        emergency: [
          ...(prev?.emergency ?? []),
          ...(input.emergency ?? []).map((e) => ({ ...e, memo: "" })),
        ].slice(0, EMERGENCY_MAX),
        family: [
          ...(prev?.family ?? []),
          ...(input.family ?? []).map((f) => ({ ...f, memo: "" })),
        ].slice(0, FAMILY_MAX),
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      };
      const next: StaffContact | null = normalizeStaffContact(prev?.id ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, merged);
      if (!next) return NextResponse.json({ error: "氏名が無いため連絡先を作れません（氏名も反映してください）" }, { status: 400 });
      await saveStaffContactRow(ca.admin, next, by, !prev);
      const changes = prev ? buildStaffContactChanges(prev, next) : staffContactSnapshot(next);
      if (changes.length > 0) {
        await recordStaffContactLog(ca.admin, { by, action: prev ? "更新（採用資料のAI整理から反映）" : "登録（採用資料のAI整理から反映）", target: next.name, changes });
      }
      applied.push("連絡先");
    }

    // ── 経歴・入職時の想い ──
    if (input.profile) {
      const prev = await fetchHiringProfile(auth.admin, input.userId);
      const next = { ...prev };
      const changes: { field: string; before: string; after: string }[] = [];
      for (const f of HIRING_PROFILE_FIELDS) {
        const p = input.profile[f.key];
        if (!p) continue;
        next[f.key] = mergeText(prev[f.key], p.value, p.mode);
        changes.push({
          field: f.label,
          before: prev[f.key].trim() ? "記載あり" : "空",
          after: prev[f.key].trim() ? (p.mode === "append" ? "記載あり（追記）" : "記載あり（置換）") : "記載あり",
        });
      }
      await saveHiringProfile(auth.admin, next, by);
      if (changes.length > 0) await recordHiringLog(auth.admin, { by, action: "反映", target: `${input.userId}:profile`, changes });
      applied.push("経歴・入職時の想い");
    }

    await recordHiringLog(auth.admin, {
      by,
      action: "反映",
      target: input.userId,
      changes: [{ field: "反映先", before: "", after: applied.join("・") || "なし" }],
    });
    return NextResponse.json({ ok: true, applied });
  } catch (e) {
    if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
