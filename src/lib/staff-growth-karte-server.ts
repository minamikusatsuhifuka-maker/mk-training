// スタッフ育成カルテ（指示書179 A）の集約（サーバー専用・管理者のみ）
//
// 【最重要: 集約で権限を超えない（A-2）】
// カルテは既存データを集めて時系列に並べるだけで、元データの閲覧権限を超えて表示しない。
//   ・5つの基本的欲求サーベイ … redactProfilesForViewer（164）を**閲覧者＝管理者自身のIDで**通す。
//     管理者も例外にしない164の規則がそのまま効き、本人が公開したものだけが残る
//   ・メンバーノート（149）    … authorizeMemberNotes() を呼び、ok のときだけ読む
//   ・入職日（169）            … authorizeStaffContacts() を呼び、ok のときだけ読む
//   ・権限委譲（173）          … authorizeDirectorRetrospective() を呼び、ok のときだけ読む。
//                                 委譲先に**氏名が入っている記録のみ**
//   ・1on1・自己評価（private_store）… 基盤（/api/private-store）の規則は「管理者＝全レコード閲覧可」。
//     カルテは管理者にしか開かないので、その規則の範囲でだけ読む（listPrivateRecordsAsAdmin）。
//     ここで独自に判定を緩めたり広げたりしない
// 家族構成（D）は**一切集めない**（年表・検索・絞り込みのどこにも出さない）。

import type { User } from "@supabase/supabase-js";
import { serverGetContentRow, serverGetContentRowsByPrefix } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY, emptyProfile, type StaffProfile } from "./staff-profiles";
import { PROFILE_ROLE_CONFIG_KEY, normalizeProfileRoles, resolveRole } from "./profile-roles";
import { redactProfilesForViewer } from "./survey-visibility";
import { NEED_KEYS, NEED_LABELS } from "./needs-survey";
import { authorizeStaffContacts, fetchAllStaffContacts } from "./staff-contacts-server";
import { authorizeMemberNotes, fetchAllNotes } from "./member-notes-server";
import {
  authorizeDirectorRetrospective,
  fetchAllRecords as fetchRetrospectiveRecords,
} from "./director-retrospective-server";
import { delegationStatusLabel } from "./director-retrospective";
import { normalizeOneOnOneData } from "./one-on-one";
import { normalizeSelfReviewData } from "./self-review";
import { jstTodayYmd } from "./library";
import {
  attachEvidenceUrls,
  fetchCourses,
  fetchGoals,
  fetchLearning,
  fetchPromiseStatuses,
  type GrowthAdminClient,
} from "./staff-growth-server";
import {
  attendanceCounts,
  attendanceLabel,
  formatDates,
  promiseTextOf,
  searchTimeline,
  sortLearningDesc,
  sortTimeline,
  venueTypeLabel,
  type Course,
  type KarteDetail,
  type KarteListEntry,
  type LearningRecord,
  type PromiseSummary,
  type SearchHit,
  type TimelineItem,
} from "./staff-growth";

// ─── 名簿 ───

type RosterPerson = {
  userId: string;
  name: string;
  roleId: string;
  roleLabel: string;
  joinedOn: string;
  retired: boolean;
};

function isBanned(u: User): boolean {
  const until = (u as User & { banned_until?: string | null }).banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

/**
 * 在籍・退職を含む全アカウントの名簿。
 * 氏名はプロフィール（staff_profiles_index）→ Auth の display_name の順。
 * 入職日は169の連絡先（管理者の認可を通したときだけ）。
 */
async function loadRoster(admin: GrowthAdminClient): Promise<RosterPerson[]> {
  const byId = new Map<string, RosterPerson>();

  // Auth の全アカウント（無効化済み含む）
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!error && data?.users) {
      for (const u of data.users) {
        const meta = u.user_metadata as Record<string, unknown> | null;
        const name = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
        byId.set(u.id, {
          userId: u.id,
          name: name || u.email || "名前未設定",
          roleId: "",
          roleLabel: "",
          joinedOn: "",
          retired: isBanned(u),
        });
      }
    }
  } catch {
    /* 取れないときはプロフィールだけで続ける */
  }

  // 役職の定義
  let roles = normalizeProfileRoles(null);
  try {
    const row = await serverGetContentRow(PROFILE_ROLE_CONFIG_KEY);
    roles = normalizeProfileRoles((row?.data as { roles?: unknown } | null)?.roles);
  } catch {
    /* 既定で続ける */
  }

  // プロフィール一覧（氏名・職種）
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const userId = typeof o.userId === "string" ? o.userId : "";
        if (!userId) continue;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const roleId = typeof o.role === "string" ? o.role : "";
        const cur = byId.get(userId) ?? {
          userId,
          name: "",
          roleId: "",
          roleLabel: "",
          joinedOn: "",
          retired: false,
        };
        byId.set(userId, {
          ...cur,
          name: name || cur.name || "名前未設定",
          roleId,
          roleLabel: resolveRole(roles, roleId).label,
        });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // 入職日（169）: 既存の認可をそのまま呼ぶ
  try {
    const contactsAuth = await authorizeStaffContacts();
    if (contactsAuth.ok) {
      const { contacts } = await fetchAllStaffContacts(contactsAuth.admin);
      for (const c of contacts) {
        if (!c.userId) continue;
        const cur = byId.get(c.userId);
        if (cur) cur.joinedOn = c.joinedOn;
      }
    }
  } catch {
    /* 入職日なしで続ける */
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// ─── private_store（1on1・自己評価）───

type PrivateRow = {
  owner_id: string;
  content_type: string;
  record_key: string;
  data: unknown;
  updated_at: string;
};

/**
 * 基盤（/api/private-store）の「管理者＝全レコード閲覧可」の範囲でだけ読む。
 * 呼び出し側は必ず isAdmin を確かめてから呼ぶこと（カルテのAPIは管理者以外404）。
 */
async function listPrivateRecordsAsAdmin(
  admin: GrowthAdminClient,
  contentType: "one_on_one" | "self_review"
): Promise<PrivateRow[]> {
  const { data, error } = await admin
    .from("private_store")
    .select("owner_id, content_type, record_key, data, updated_at")
    .eq("content_type", contentType);
  if (error) throw new Error(error.message);
  return (data ?? []) as PrivateRow[];
}

// ─── 集約の材料 ───

type Sources = {
  roster: RosterPerson[];
  courses: Course[];
  courseName: (id: string) => string;
  learning: LearningRecord[];
  counts: Map<string, number>;
  oneOnOne: PrivateRow[];
  selfReview: PrivateRow[];
  notesByUser: Map<string, { updatedAt: string; strengths: string; memo: string }>;
  delegations: { date: string; task: string; status: string; toName: string; toRole: string }[];
  surveyByUser: Map<string, { updatedAt: string; summary: string }>;
  tableMissing: boolean;
};

async function loadSources(admin: GrowthAdminClient, viewerUserId: string): Promise<Sources> {
  const [roster, coursesRes, learningRes] = await Promise.all([
    loadRoster(admin),
    fetchCourses(admin),
    fetchLearning(admin),
  ]);
  const courseMap = new Map(coursesRes.courses.map((c) => [c.id, c]));
  const courseName = (id: string) => courseMap.get(id)?.name ?? "（講座不明）";

  // 1on1・自己評価（基盤の管理者規則の範囲）
  let oneOnOne: PrivateRow[] = [];
  let selfReview: PrivateRow[] = [];
  try {
    [oneOnOne, selfReview] = await Promise.all([
      listPrivateRecordsAsAdmin(admin, "one_on_one"),
      listPrivateRecordsAsAdmin(admin, "self_review"),
    ]);
  } catch {
    /* 読めないときは無しで続ける */
  }

  // メンバーノート（149の認可をそのまま呼ぶ）
  const notesByUser = new Map<string, { updatedAt: string; strengths: string; memo: string }>();
  try {
    const notesAuth = await authorizeMemberNotes();
    if (notesAuth.ok) {
      const { notes } = await fetchAllNotes(notesAuth.admin);
      for (const n of notes) {
        notesByUser.set(n.staffUserId, {
          updatedAt: n.updatedAt,
          strengths: n.strengths,
          memo: n.memo,
        });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // 権限委譲（173の認可をそのまま呼ぶ・氏名が入っている記録のみ）
  const delegations: Sources["delegations"] = [];
  try {
    const retroAuth = await authorizeDirectorRetrospective();
    if (retroAuth.ok) {
      const { data } = await fetchRetrospectiveRecords(retroAuth.admin);
      const periodById = new Map(data.periods.map((p) => [p.id, p]));
      for (const d of data.delegations) {
        if (!d.toName.trim()) continue;
        // 委譲の記録には日付が無いので、記録日（無ければ期の開始月）を年表の位置にする
        const p = periodById.get(d.periodId);
        const date =
          (d.createdAt || d.updatedAt || "").slice(0, 10) ||
          (p?.startYm ? `${p.startYm}-01` : "");
        delegations.push({
          date,
          task: d.task,
          status: delegationStatusLabel(d.status),
          toName: d.toName.trim(),
          toRole: d.toRole,
        });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // 公開されたサーベイ（164の判定を閲覧者＝管理者自身で通す）
  const surveyByUser = new Map<string, { updatedAt: string; summary: string }>();
  try {
    const rows = await serverGetContentRowsByPrefix("staff_profile:");
    const profiles: StaffProfile[] = [];
    for (const row of rows) {
      const p = row.data as StaffProfile | null;
      if (!p || typeof p.userId !== "string") continue;
      profiles.push({ ...emptyProfile(p.userId), ...p });
    }
    for (const p of redactProfilesForViewer(profiles, viewerUserId)) {
      if (!p.needsSurvey) continue; // 非公開はキーごと落ちている
      const values = p.needsSurvey.values ?? {};
      const summary = NEED_KEYS.filter((k) => typeof values[k] === "number")
        .map((k) => `${NEED_LABELS[k]} ${values[k]}`)
        .join(" / ");
      surveyByUser.set(p.userId, {
        updatedAt: p.needsSurvey.updatedAt || p.updatedAt || "",
        summary,
      });
    }
  } catch {
    /* 飛ばす */
  }

  return {
    roster,
    courses: coursesRes.courses,
    courseName,
    learning: learningRes.records,
    counts: attendanceCounts(learningRes.records),
    oneOnOne,
    selfReview,
    notesByUser,
    delegations,
    surveyByUser,
    tableMissing: coursesRes.tableMissing || learningRes.tableMissing,
  };
}

// ─── 年表の組み立て ───

function nameOf(roster: RosterPerson[], userId: string, fallback: string): string {
  return roster.find((p) => p.userId === userId)?.name || fallback;
}

function buildTimeline(src: Sources, person: RosterPerson): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (person.joinedOn) {
    items.push({
      kind: "joined",
      date: person.joinedOn,
      title: "入職",
      body: "",
      href: "/staff-contacts",
    });
  }

  for (const r of src.oneOnOne) {
    const d = normalizeOneOnOneData(r.data);
    const involved = r.owner_id === person.userId || d.participantIds.includes(person.userId);
    if (!involved || !d.heldOn) continue;
    const other =
      r.owner_id === person.userId
        ? d.participantIds[0]
          ? nameOf(src.roster, d.participantIds[0], d.partnerName || "相手")
          : d.partnerName || "相手"
        : nameOf(src.roster, r.owner_id, d.authorName || "記録者");
    const promise = promiseTextOf(d);
    const bodyParts = [
      d.mode === "rwdepc"
        ? [d.rwdepc.w && `W: ${d.rwdepc.w}`, d.rwdepc.p && `P: ${d.rwdepc.p}`]
        : [d.sections.theme && `テーマ: ${d.sections.theme}`, d.sections.kizuki && `気づき: ${d.sections.kizuki}`],
      promise && `約束: ${promise}`,
    ]
      .flat()
      .filter(Boolean) as string[];
    items.push({
      kind: "one_on_one",
      date: d.heldOn,
      title: `1on1（${other}さんと・${d.mode === "rwdepc" ? "RWDEPC" : "クイックメモ"}）`,
      body: bodyParts.join("\n"),
      href: "/one-on-one",
    });
  }

  for (const l of src.learning) {
    if (l.userId !== person.userId) continue;
    const n = attendanceLabel(src.counts.get(l.id));
    const place = [venueTypeLabel(l.venueType), l.venueName].filter(Boolean).join(" ");
    items.push({
      kind: "learning",
      // 並び順の基準は最初の参加日（180 2-2）
      date: l.startDate || l.createdAt.slice(0, 10),
      title: `${src.courseName(l.courseId)}${n ? `（${n}）` : ""}`,
      body: [l.dates.length > 1 ? `参加日: ${formatDates(l.dates)}` : "", place, l.learned && `学んだこと: ${l.learned}`, l.nextAction && `次にやること: ${l.nextAction}`, l.tags.length ? `タグ: ${l.tags.join("・")}` : ""]
        .filter(Boolean)
        .join("\n"),
      href: "/my-growth",
      learningId: l.id,
    });
  }

  const note = src.notesByUser.get(person.userId);
  if (note && (note.strengths.trim() || note.memo.trim())) {
    items.push({
      kind: "member_note",
      date: note.updatedAt.slice(0, 10),
      title: "メンバーノート（最終更新）",
      body: [note.strengths && `強み: ${note.strengths}`, note.memo && `メモ: ${note.memo}`]
        .filter(Boolean)
        .join("\n"),
      href: "/member-notes",
    });
  }

  for (const r of src.selfReview) {
    if (r.owner_id !== person.userId) continue;
    const d = normalizeSelfReviewData(r.data);
    const date = (d.filled_at || r.updated_at || "").slice(0, 10);
    items.push({
      kind: "self_review",
      date,
      title: `自己評価シート ${d.period_label || r.record_key}（${d.status === "submitted" ? "提出済み" : "下書き"}）`,
      body: [
        d.sections.output.done && `できたこと: ${d.sections.output.done}`,
        d.sections.output.kizuki && `気づき: ${d.sections.output.kizuki}`,
        d.sections.output.next && `次に: ${d.sections.output.next}`,
        d.sections.raiki.wants && `来期やりたいこと: ${d.sections.raiki.wants}`,
      ]
        .filter(Boolean)
        .join("\n"),
      href: "/admin/portal",
    });
  }

  const survey = src.surveyByUser.get(person.userId);
  if (survey) {
    items.push({
      kind: "survey",
      date: survey.updatedAt.slice(0, 10),
      title: "5つの基本的欲求サーベイ（本人が公開）",
      body: survey.summary,
      href: "/members",
    });
  }

  for (const d of src.delegations) {
    if (d.toName !== person.name) continue;
    items.push({
      kind: "delegation",
      date: d.date,
      title: `権限委譲: ${d.task}`,
      body: [d.toRole && `役割: ${d.toRole}`, `状態: ${d.status}`].filter(Boolean).join(" / "),
      href: "/director-retrospective",
    });
  }

  return sortTimeline(items);
}

function buildEntry(src: Sources, p: RosterPerson): KarteListEntry {
  const mine = sortLearningDesc(src.learning.filter((l) => l.userId === p.userId));
  return {
    userId: p.userId,
    name: p.name,
    roleId: p.roleId,
    roleLabel: p.roleLabel,
    joinedOn: p.joinedOn,
    retired: p.retired,
    courseIds: Array.from(new Set(mine.map((l) => l.courseId))),
    tags: Array.from(new Set(mine.flatMap((l) => l.tags))),
    learningCount: mine.length,
    lastLearningOn: mine[0]?.startDate ?? "",
  };
}

// ─── 公開API（管理者のみ・呼び出し側で保証）───

export async function buildKarteList(
  admin: GrowthAdminClient,
  viewerUserId: string
): Promise<{ entries: KarteListEntry[]; courses: Course[]; tableMissing: boolean; today: string }> {
  const src = await loadSources(admin, viewerUserId);
  return {
    entries: src.roster.map((p) => buildEntry(src, p)),
    courses: src.courses,
    tableMissing: src.tableMissing,
    today: jstTodayYmd(),
  };
}

export async function buildKarteDetail(
  admin: GrowthAdminClient,
  viewerUserId: string,
  userId: string
): Promise<(KarteDetail & { courses: Course[]; tableMissing: boolean; today: string }) | null> {
  const src = await loadSources(admin, viewerUserId);
  const person = src.roster.find((p) => p.userId === userId);
  if (!person) return null;

  const timeline = buildTimeline(src, person);

  // 最新の1on1の約束（本人の取り組み状況つき）
  let latestPromise: PromiseSummary | null = null;
  const { statuses } = await fetchPromiseStatuses(admin, userId);
  const involved = src.oneOnOne
    .map((r) => ({ r, d: normalizeOneOnOneData(r.data) }))
    .filter(
      ({ r, d }) =>
        d.heldOn && (r.owner_id === userId || d.participantIds.includes(userId)) && promiseTextOf(d)
    )
    .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
  if (involved[0]) {
    const { r, d } = involved[0];
    const st = statuses.find((s) => s.oneOnOneKey === r.record_key && s.ownerId === r.owner_id);
    latestPromise = {
      date: d.heldOn,
      partnerName:
        r.owner_id === userId
          ? nameOf(src.roster, d.participantIds[0] ?? "", d.partnerName || "相手")
          : nameOf(src.roster, r.owner_id, d.authorName || "記録者"),
      text: promiseTextOf(d),
      status: st?.status ?? null,
      note: st?.note ?? "",
    };
  }

  const recent = sortLearningDesc(src.learning.filter((l) => l.userId === userId)).slice(0, 3);
  const { records: recentLearning } = await attachEvidenceUrls(admin, recent);
  const { goals } = await fetchGoals(admin, userId);

  return {
    entry: buildEntry(src, person),
    latestPromise,
    recentLearning,
    nextOneOnOne: null,
    timeline,
    goals,
    courses: src.courses,
    tableMissing: src.tableMissing,
    today: jstTodayYmd(),
  };
}

/** 横断検索（A-5・管理者のみ）。年表に載る本文だけが対象＝家族構成は対象外 */
export async function searchKarte(
  admin: GrowthAdminClient,
  viewerUserId: string,
  q: string
): Promise<SearchHit[]> {
  const src = await loadSources(admin, viewerUserId);
  const byUser = new Map<string, TimelineItem[]>();
  for (const p of src.roster) byUser.set(p.userId, buildTimeline(src, p));
  return searchTimeline(byUser, q);
}
