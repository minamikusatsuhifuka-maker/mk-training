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
import { NEED_KEYS, NEED_LABELS, isPdfAsset, type NeedsSurvey } from "./needs-survey";
import { redactSurveyForViewer } from "./survey-visibility";
import { loadSurveyHistory } from "./survey-history-server";
import { surveyFromEntry } from "./survey-history";
import { signOne } from "./storage-signed";
import { fetchHiringDocs, fetchProspects, findAccountsByEmail } from "./hiring-docs-server";
import { hiringDocKindLabel, isProspectStale, type HiringDoc, type Prospect } from "./hiring-docs";
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
  fetchFeedback,
  fetchGoals,
  fetchLearning,
  fetchPromiseStatuses,
  type GrowthAdminClient,
} from "./staff-growth-server";
import {
  attachSurveyDiffs,
  attendanceCounts,
  attendanceLabel,
  formatDates,
  promiseStatusLabel,
  promiseTextOf,
  searchTimeline,
  sortLearningDesc,
  sortTimeline,
  venueTypeLabel,
  type Course,
  type KarteDetail,
  type KarteListEntry,
  type Feedback,
  type LearningRecord,
  type PromiseStatus,
  type PromiseSummary,
  type SearchHit,
  type SurveyView,
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
  /** 187: 入職予定者（アカウント作成前） */
  prospect?: Prospect;
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
async function loadRoster(
  admin: GrowthAdminClient,
  opts?: { skipContacts?: boolean }
): Promise<RosterPerson[]> {
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

  // 入職日（169）: 既存の認可をそのまま呼ぶ。183: 幹部モードでは読まない（連絡先は見せない）
  try {
    const contactsAuth = opts?.skipContacts ? ({ ok: false } as const) : await authorizeStaffContacts();
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

  // 187: 入職予定者（院長のみ）。紐づけ済み・入職しなかった人は一覧に出さない（削除の導線は別）
  if (!opts?.skipContacts) {
    try {
      const { prospects } = await fetchProspects(admin);
      for (const p of prospects) {
        if (p.status === "linked") continue;
        byId.set(p.id, { userId: p.id, name: p.name, roleId: "", roleLabel: "入職予定", joinedOn: "", retired: false, prospect: p });
      }
    } catch {
      /* 無しで続ける */
    }
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

/**
 * 183: 集める範囲。
 *   full     … 管理者。すべて（1on1本文・メンバーノート・自己評価・権限委譲・入職日を含む）
 *   delegate … 担当の幹部。学びの記録・自分の目標・1on1の約束と取り組み状況・本人が公開したサーベイ **だけ**。
 *              それ以外は集めない（＝応答にも検索にも入らない）。名簿も担当スタッフだけ
 */
export type KarteScope = { mode: "full" } | { mode: "delegate"; staffIds: string[] };

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
  /** 公開されたサーベイ（履歴を含む・古い順・前回との差つき） */
  surveyByUser: Map<string, SurveyView[]>;
  /** 183: 1on1の約束の取り組み状況（幹部モードでも出す。本文は約束だけ） */
  promiseStatuses: Map<string, PromiseStatus[]>;
  /** 184: 採用資料（院長のみ＝full モードだけ集める。幹部モードでは空） */
  hiringDocsByUser: Map<string, HiringDoc[]>;
  /** 185: フィードバック（院長=全件／幹部=自分が記録したものだけ） */
  feedbackByUser: Map<string, Feedback[]>;
  scope: KarteScope;
  tableMissing: boolean;
};

/** 公開範囲に絞った1件 → 年表用（画像は署名URL） */
async function toSurveyView(admin: GrowthAdminClient, shared: NeedsSurvey): Promise<SurveyView> {
  const values: SurveyView["values"] = {};
  for (const k of NEED_KEYS) {
    const v = shared.values?.[k];
    if (typeof v === "number") values[k] = v;
  }
  let imageUrl = "";
  if (shared.imageUrl) {
    try {
      imageUrl = await signOne(admin, shared.imageUrl);
    } catch {
      imageUrl = "";
    }
  }
  const view: SurveyView = {
    answeredOn: (shared.updatedAt || "").slice(0, 10),
    values,
    imageUrl,
    isPdf: isPdfAsset(shared.imageUrl),
  };
  // 「詳細も公開」の人だけ details（欲求の値だけ）が残っている
  if (shared.details) {
    const details: Record<string, number> = {};
    for (const [key, d] of Object.entries(shared.details)) {
      if (typeof d.desire === "number") details[key] = d.desire;
    }
    if (Object.keys(details).length > 0) view.details = details;
  }
  return view;
}

function summaryOf(view: SurveyView): string {
  return NEED_KEYS.filter((k) => typeof view.values[k] === "number")
    .map((k) => `${NEED_LABELS[k]} ${view.values[k]}`)
    .join(" / ");
}

async function loadSources(
  admin: GrowthAdminClient,
  viewerUserId: string,
  scope: KarteScope = { mode: "full" }
): Promise<Sources> {
  const delegate = scope.mode === "delegate";
  const allowed = new Set(delegate ? scope.staffIds : []);
  const [rosterAll, coursesRes, learningRes] = await Promise.all([
    loadRoster(admin, delegate ? { skipContacts: true } : undefined),
    fetchCourses(admin),
    fetchLearning(admin),
  ]);
  // 幹部モード: 名簿も学びも担当スタッフだけに絞る（他の人は存在ごと出さない）
  const roster = delegate ? rosterAll.filter((p) => allowed.has(p.userId)) : rosterAll;
  if (delegate) learningRes.records = learningRes.records.filter((l) => allowed.has(l.userId));
  const courseMap = new Map(coursesRes.courses.map((c) => [c.id, c]));
  const courseName = (id: string) => courseMap.get(id)?.name ?? "（講座不明）";

  // 1on1・自己評価（基盤の管理者規則の範囲）。
  // 183: 幹部モードでは 1on1 は「約束」の抽出にだけ使い（本文は年表に載せない）、自己評価は読まない
  let oneOnOne: PrivateRow[] = [];
  let selfReview: PrivateRow[] = [];
  try {
    [oneOnOne, selfReview] = await Promise.all([
      listPrivateRecordsAsAdmin(admin, "one_on_one"),
      delegate ? Promise.resolve([] as PrivateRow[]) : listPrivateRecordsAsAdmin(admin, "self_review"),
    ]);
  } catch {
    /* 読めないときは無しで続ける */
  }
  if (delegate) {
    oneOnOne = oneOnOne.filter((r) => {
      const d = normalizeOneOnOneData(r.data);
      return allowed.has(r.owner_id) || d.participantIds.some((id) => allowed.has(id));
    });
  }

  // 1on1の約束の取り組み状況（本人が書いたもの）
  const promiseStatuses = new Map<string, PromiseStatus[]>();
  try {
    const { statuses } = await fetchPromiseStatuses(admin);
    for (const s of statuses) {
      if (delegate && !allowed.has(s.userId)) continue;
      const list = promiseStatuses.get(s.userId);
      if (list) list.push(s);
      else promiseStatuses.set(s.userId, [s]);
    }
  } catch {
    /* 無しで続ける */
  }

  // メンバーノート（149の認可をそのまま呼ぶ）。183: 幹部モードでは読まない（院長メモは見せない）
  const notesByUser = new Map<string, { updatedAt: string; strengths: string; memo: string }>();
  try {
    const notesAuth = delegate ? ({ ok: false } as const) : await authorizeMemberNotes();
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

  // 権限委譲（173の認可をそのまま呼ぶ・氏名が入っている記録のみ）。183: 幹部モードでは読まない
  const delegations: Sources["delegations"] = [];
  try {
    const retroAuth = delegate ? ({ ok: false } as const) : await authorizeDirectorRetrospective();
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

  // 185: フィードバック。院長は全件、幹部は**自分が記録したものだけ**（E）
  const feedbackByUser = new Map<string, Feedback[]>();
  try {
    const { feedback } = await fetchFeedback(admin, delegate ? { authorId: viewerUserId } : {});
    for (const f of feedback) {
      if (delegate && !allowed.has(f.userId)) continue;
      const list = feedbackByUser.get(f.userId);
      if (list) list.push(f);
      else feedbackByUser.set(f.userId, [f]);
    }
  } catch {
    /* 無しで続ける */
  }

  // 184: 採用資料の日付（院長のみ）。テーブル未作成・失敗は無しで続ける
  const hiringDocsByUser = new Map<string, HiringDoc[]>();
  if (!delegate) {
    try {
      const { docs } = await fetchHiringDocs(admin);
      for (const d of docs) {
        const list = hiringDocsByUser.get(d.userId);
        if (list) list.push(d);
        else hiringDocsByUser.set(d.userId, [d]);
      }
    } catch {
      /* 無しで続ける */
    }
  }

  // 公開されたサーベイ（164の判定を閲覧者＝管理者自身で通す）
  //
  // 【181: 出す中身は本人への説明の範囲だけ】
  // プロフィールの公開設定の説明は「レーダーチャートと画像がメンバー紹介で見える」。
  // よってカルテに出すのは 5欲求の点数（レーダー）・結果画像（署名URL）・回答日 まで。
  // 15項目の詳細（details: 欲求／注力／現況）は説明に含まれていないため**ここで作らない＝クライアントに渡らない**
  //（181 2-1。院長の判断で公開範囲を広げるときは、本人の公開設定に選択肢を足してから）。
  //
  // 【182】履歴（survey_history:<userId>・サーバー専用キー）も、本人の**現在の公開設定**をそのまま
  // 適用して読む（B-3: 非公開にすれば過去の結果もすべて見えない）。詳細15項目の「欲求」は
  // 「詳細も公開」の人だけ（redactSurveyForViewer が判定＝渡す前に絞る）。
  const surveyByUser = new Map<string, SurveyView[]>();
  try {
    const rows = await serverGetContentRowsByPrefix("staff_profile:");
    const profiles: StaffProfile[] = [];
    for (const row of rows) {
      const p = row.data as StaffProfile | null;
      if (!p || typeof p.userId !== "string") continue;
      profiles.push({ ...emptyProfile(p.userId), ...p });
    }
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    for (const p of redactProfilesForViewer(profiles, viewerUserId)) {
      if (delegate && !allowed.has(p.userId)) continue; // 担当外は集めない
      if (!p.needsSurvey) continue; // 非公開はキーごと落ちている
      const original = byId.get(p.userId)?.needsSurvey;
      const visibility = original?.visibility ?? "private";
      const views: SurveyView[] = [];
      // 現在の結果（中身があるときだけ）
      if (p.needsSurvey.imageUrl || Object.keys(p.needsSurvey.values ?? {}).length > 0) {
        views.push(await toSurveyView(admin, { ...p.needsSurvey, updatedAt: original?.updatedAt || p.updatedAt || "" }));
      }
      // 履歴（現在の公開設定で同じように絞る）
      for (const entry of await loadSurveyHistory(p.userId)) {
        const shared = redactSurveyForViewer(surveyFromEntry(entry, visibility));
        if (shared) views.push(await toSurveyView(admin, shared));
      }
      if (views.length > 0) surveyByUser.set(p.userId, attachSurveyDiffs(views, NEED_KEYS));
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
    promiseStatuses,
    hiringDocsByUser,
    feedbackByUser,
    scope,
    tableMissing: coursesRes.tableMissing || learningRes.tableMissing,
  };
}

// ─── 年表の組み立て ───

function nameOf(roster: RosterPerson[], userId: string, fallback: string): string {
  return roster.find((p) => p.userId === userId)?.name || fallback;
}

function buildTimeline(src: Sources, person: RosterPerson): TimelineItem[] {
  const items: TimelineItem[] = [];

  const delegate = src.scope.mode === "delegate";

  if (person.joinedOn && !delegate) {
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
    if (delegate) {
      // 183 A-3: 幹部には「約束と取り組み状況」だけ。面談の本文・7つの実・RWDEPC は出さない
      const promise = promiseTextOf(d);
      if (!promise) continue;
      const st = (src.promiseStatuses.get(person.userId) ?? []).find(
        (s) => s.oneOnOneKey === r.record_key && s.ownerId === r.owner_id
      );
      items.push({
        kind: "one_on_one",
        date: d.heldOn,
        title: "1on1の約束",
        body: [
          `約束: ${promise}`,
          st ? `取り組み状況: ${promiseStatusLabel(st.status)}${st.note.trim() ? ` ・ ${st.note}` : ""}` : "取り組み状況: 未記入",
        ].join("\n"),
        href: "/one-on-one",
      });
      continue;
    }
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

  // 185: フィードバック（院長=全件／幹部=自分の記録だけ）
  for (const f of src.feedbackByUser.get(person.userId) ?? []) {
    items.push({
      kind: "feedback",
      date: f.date || f.createdAt.slice(0, 10),
      title: f.type === "positive" ? `ポジティブFB（${f.authorName || "記録者"}）` : `ギャップFB（${f.authorName || "記録者"}）`,
      body:
        f.type === "positive"
          ? [f.scene && `場面: ${f.scene}`, f.whatGood && `良かったこと: ${f.whatGood}`].filter(Boolean).join("\n")
          : [f.fact && `① 事実: ${f.fact}`, f.issue && `② すり合わせ: ${f.issue}`, f.plan && `③ 改善計画: ${f.plan}`].filter(Boolean).join("\n"),
      href: `/staff-growth/${encodeURIComponent(person.userId)}#feedback`,
    });
  }

  // 184: 登録した採用資料の日付（院長のみ）。中身は出さず、種類とメモだけ
  for (const d of src.hiringDocsByUser.get(person.userId) ?? []) {
    items.push({
      kind: "hiring_doc",
      date: d.docDate || d.createdAt.slice(0, 10),
      title: `採用資料: ${hiringDocKindLabel(d.kind)}`,
      body: d.memo,
      href: `/staff-growth/${encodeURIComponent(person.userId)}#hiring`,
    });
  }

  for (const view of src.surveyByUser.get(person.userId) ?? []) {
    const nth = view.total && view.total > 1 ? `・${view.seq}回目` : "";
    items.push({
      kind: "survey",
      date: view.answeredOn,
      title: `5つの基本的欲求サーベイ（本人が公開${nth}）`,
      body: summaryOf(view),
      href: "/members",
      survey: view,
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

function buildEntry(src: Sources, p: RosterPerson, candidates?: Map<string, { userId: string; name: string }>): KarteListEntry {
  const mine = sortLearningDesc(src.learning.filter((l) => l.userId === p.userId));
  const today = jstTodayYmd();
  return {
    ...(p.prospect
      ? {
          prospect: {
            expectedJoinOn: p.prospect.expectedJoinOn,
            status: p.prospect.status,
            email: p.prospect.email,
            stale: isProspectStale(p.prospect, today),
            candidate: (p.prospect.email && candidates?.get(p.prospect.email)) || null,
          },
        }
      : {}),
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
  viewerUserId: string,
  scope: KarteScope = { mode: "full" }
): Promise<{ entries: KarteListEntry[]; courses: Course[]; tableMissing: boolean; today: string }> {
  const src = await loadSources(admin, viewerUserId, scope);
  // 187: 入職予定者のメールに一致するアカウント（紐づけ候補）
  const emails = src.roster.filter((p) => p.prospect?.email).map((p) => p.prospect!.email);
  const candidates = scope.mode === "full" && emails.length > 0 ? await findAccountsByEmail(admin, emails) : undefined;
  return {
    entries: src.roster.map((p) => buildEntry(src, p, candidates)),
    courses: src.courses,
    tableMissing: src.tableMissing,
    today: jstTodayYmd(),
  };
}

export async function buildKarteDetail(
  admin: GrowthAdminClient,
  viewerUserId: string,
  userId: string,
  scope: KarteScope = { mode: "full" }
): Promise<(KarteDetail & { courses: Course[]; tableMissing: boolean; today: string }) | null> {
  const src = await loadSources(admin, viewerUserId, scope);
  const person = src.roster.find((p) => p.userId === userId);
  if (!person) return null; // 幹部モードでは担当外＝名簿に無い＝「存在しない」と同じ

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
  q: string,
  scope: KarteScope = { mode: "full" }
): Promise<SearchHit[]> {
  // 183 A-4: 幹部の検索は担当スタッフの許可された内容（＝幹部モードの年表）だけが対象。
  // 見せない内容は年表に無いので、件数・抜粋・並び順からも一致の有無が推測できない
  const src = await loadSources(admin, viewerUserId, scope);
  const byUser = new Map<string, TimelineItem[]>();
  for (const p of src.roster) byUser.set(p.userId, buildTimeline(src, p));
  return searchTimeline(byUser, q);
}
