// スタッフ名簿 → スタッフ個人シート（指示書 mk_training_staff_sheet_1 §2）
//   GET → { members: [{ name, link: "open" | "unlinked" | "ambiguous" | "none", userId?, next? }], isAdmin }
//
// - 名簿（content_store `staff_members`＝名前だけ）と、名簿の軽量読み取り（staff_profiles_index の userId・氏名）を
//   **正規化した名前**（NFKC＋空白除去）で突き合わせる。1人に決まらない名前は紐付けない。
// - userId と概要（次の1on1・事前アンケートの状態）を返すのは、見ている人が **canViewStaff** でその人を見られるときだけ
//   （院長＝全員／担当の幹部＝担当スタッフだけ）。それ以外の名前は名前だけ（link: "none"）。
// - 「未連携」「同名で決められない」と分かるのは院長だけ（幹部には none と同じに見せる）。
// - 第5便: 名簿の管理（スタッフ管理）を任された人には「名簿の管理ビュー」を返す：連携・在籍区分・入職日・
//   未登録アカウントまで（＝一つの一覧で管理業務ができる）。ただしシートへのリンク（userId）と
//   1on1 の概要は出さない（個人シートの閲覧権限は今までどおり canViewStaff）。
// - 回答の本文は返さない（「答えたか」だけ）。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { loadDelegatedItems, isActiveAccountId } from "@/lib/admin-delegation-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { serverGetContentRow } from "@/lib/content-store-server";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import { matchRosterNames, normalizePersonName } from "@/lib/staff-sheet";
import { fetchAllStaffContacts } from "@/lib/staff-contacts-server";
import { jstTodayYmd } from "@/lib/library";
import { fetchSchedules, withAnswerState } from "@/lib/one-on-one-schedule-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** lib/staff-tasks.ts の STAFF_MEMBERS_KEY と同じ値（あちらはクライアント用の content-store を読み込むので、ここでは写す） */
const STAFF_MEMBERS_KEY = "staff_members";

export type RosterMemberView = {
  name: string;
  link: "open" | "unlinked" | "ambiguous" | "none";
  userId?: string;
  next?: { date: string; time: string; answered: boolean; state: string } | null;
  /** 第2便：アカウントの状態（院長だけ）。disabled=無効化（退職の扱い・169-3-4） */
  account?: "active" | "disabled";
  /** 第2便：入職日 YYYY-MM-DD（院長だけ・スタッフ連絡先から。未登録は空） */
  joinedOn?: string;
  /** 第5便：在籍区分（スタッフ連絡先から）。産休・育休/休職は在籍のまま・無効化とは別 */
  employment?: "active" | "maternity" | "leave" | "left";
};

/** 第2便：アカウント（プロフィール登録済み）はあるのに名簿に載っていない人（院長だけ） */
export type UnregisteredAccountView = {
  userId: string;
  name: string;
  account: "active" | "disabled";
};

export async function GET() {
  const auth = await authorizeGrowth();
  // 院長、または担当スタッフを指定された幹部（183）。第5便: 「スタッフ管理」を任された人は名簿の管理ビュー
  let rosterManager = false;
  if (!auth.ok || (!auth.isAdmin && auth.assignedStaffIds.length === 0)) {
    const { user } = await getSessionUser();
    if (!user) return hidden();
    try {
      rosterManager =
        (await loadDelegatedItems(user.id)).includes("staff-members") &&
        (await isActiveAccountId(user.id));
    } catch {
      rosterManager = false;
    }
    if (!rosterManager) return hidden();
  }
  const isAdmin = auth.ok && auth.isAdmin;
  const adminClient = auth.ok ? auth.admin : createSupabaseAdminClient();
  try {
    const row = await serverGetContentRow(STAFF_MEMBERS_KEY);
    const names = Array.isArray(row?.data) ? (row.data as unknown[]).filter((n): n is string => typeof n === "string") : [];
    const people = await loadProfilesIndexServer();
    const matches = matchRosterNames(names, people);

    const viewable = auth.ok ? matches.filter((m) => m.userId && canViewStaff(auth, m.userId)).map((m) => m.userId) : [];
    const today = jstTodayYmd();
    const nextByUser = new Map<string, RosterMemberView["next"]>();
    if (auth.ok && viewable.length > 0) {
      const { schedules } = await fetchSchedules(auth.admin, {});
      const mine = schedules.filter((s) => viewable.includes(s.userId));
      const views = await withAnswerState(auth.admin, mine, today);
      for (const v of views) {
        if (nextByUser.has(v.userId)) continue; // withAnswerState は日付の早い順
        nextByUser.set(v.userId, { date: v.date, time: v.time, answered: v.answered, state: v.state });
      }
    }

    const members: RosterMemberView[] = matches.map((m) => {
      if (auth.ok && m.userId && canViewStaff(auth, m.userId)) {
        return { name: m.name, link: "open", userId: m.userId, next: nextByUser.get(m.userId) ?? null };
      }
      // 第5便: 名簿の管理ビュー（院長・任された人）。連携済みでも userId は出さない（シートは開けない）
      if ((isAdmin || rosterManager) && m.ambiguous) return { name: m.name, link: "ambiguous" };
      if ((isAdmin || rosterManager) && !m.userId) return { name: m.name, link: "unlinked" };
      if (rosterManager && m.userId) return { name: m.name, link: "open" };
      return { name: m.name, link: "none" };
    });

    // ── 第2便（§1・§3）：院長にだけ、アカウントの状態・入職日・「名簿に未登録のアカウント」を足す ──
    // どれも**今ある情報を集めて見せるだけ**（新しい保存先は作らない）。取得に失敗しても名簿本体は返す。
    let unregisteredAccounts: UnregisteredAccountView[] | undefined;
    let profilelessAccountCount: number | undefined;
    if (isAdmin || rosterManager) {
      try {
        const now = Date.now();
        const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const disabledIds = new Set<string>();
        const authIds = new Set<string>();
        for (const u of data?.users ?? []) {
          authIds.add(u.id);
          const until = (u as { banned_until?: string | null }).banned_until;
          if (until && !Number.isNaN(new Date(until).getTime()) && new Date(until).getTime() > now) {
            disabledIds.add(u.id);
          }
        }
        for (const m of members) {
          if (m.userId) m.account = disabledIds.has(m.userId) ? "disabled" : "active";
        }
        // 名簿（正規化名）に無いプロフィール登録者 ＝ 「一覧に出ないスタッフ」の主な原因
        const rosterKeys = new Set(matches.map((m) => normalizePersonName(m.name)));
        unregisteredAccounts = people
          .filter((p) => p.name && !rosterKeys.has(normalizePersonName(p.name)))
          .map((p) => ({
            userId: p.userId,
            name: p.name,
            account: disabledIds.has(p.userId) ? ("disabled" as const) : ("active" as const),
          }));
        // アカウントはあるがプロフィール（表示名）も未登録の人は、名前が無いので件数だけ
        const profiled = new Set(people.map((p) => p.userId));
        profilelessAccountCount = [...authIds].filter((id) => !profiled.has(id)).length;
      } catch {
        // ベストエフォート（アカウント一覧が読めなくても名簿は出す）
      }
      try {
        const { contacts } = await fetchAllStaffContacts(adminClient);
        // 第5便: 入職日と在籍区分（産休・育休/休職/退職）。名簿名→連絡先は userId、無ければ正規化名で引く
        const byUser = new Map(contacts.map((c) => [c.userId, c] as const));
        const byName = new Map(contacts.map((c) => [normalizePersonName(c.name), c] as const));
        const matchByName = new Map(matches.map((m) => [m.name, m.userId] as const));
        for (const m of members) {
          const uid = matchByName.get(m.name);
          const c = (uid ? byUser.get(uid) : undefined) ?? byName.get(normalizePersonName(m.name));
          if (c) {
            m.joinedOn = c.joinedOn;
            m.employment = c.employment;
          }
        }
      } catch {
        // 連絡先テーブル未作成などでも名簿は出す
      }
    }

    return NextResponse.json({
      members,
      isAdmin,
      rosterManager,
      ...(unregisteredAccounts !== undefined ? { unregisteredAccounts } : {}),
      ...(profilelessAccountCount !== undefined ? { profilelessAccountCount } : {}),
    });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
