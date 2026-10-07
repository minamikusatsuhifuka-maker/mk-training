// 検証用データの作成・一括削除（指示書191・サーバー専用・院長のみ）
//
// 【作成（A）】何度実行しても重複しない（id を固定し upsert。アカウントはメールで探して無ければ作る）。
//   ・アカウント: app_metadata.test_seed = true（本人が書き換えられない領域）。パスワードは Auth にだけ渡す（画面・ログ・ファイルに残さない）
//   ・作るデータには data.seed191 = true を付ける（削除の対象一覧を作るため）
//   ・staff_profiles_index には載せない（一般スタッフの画面に出さない・B）。氏名は Auth の表示名で解決される
//   ・作らないもの: お知らせ・気づき・ありがとう・書類進捗・ヒヤリハット等の投稿、採用資料・スカウターの原本（画像・PDF）
// 【削除（C）】検証用の印が付いたアカウントに紐づくものだけを対象一覧にし、他の userId が混ざっていないことを確かめてから消す。

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { GROWTH_TABLE, fetchCourses, fetchLearning, newGrowthId, recordGrowthLog } from "./staff-growth-server";
import { normalizeCourse, normalizeCourseName, normalizeFeedback, normalizeGoal, normalizeLearning, promiseStatusId, type Course, type PromiseStatusValue } from "./staff-growth";
import { HIRING_BUCKET, deleteHiringDoc, ensureHiringBucket, fetchHiringDocs, fetchProspects, recordHiringLog, saveHiringDoc, saveProspect, deleteProspectRow } from "./hiring-docs-server";
import { normalizeHiringDoc, normalizeProspect } from "./hiring-docs";
import { fetchAllStaffContacts, saveStaffContactRow, deleteStaffContactRow, recordStaffContactLog } from "./staff-contacts-server";
import { normalizeStaffContact } from "./staff-contacts";
import { serverDeleteContentRow, serverGetContentRow, serverPutContentRow } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY, staffProfileKey, emptyProfile } from "./staff-profiles";
import { saveSurveyHistory } from "./survey-history-server";
import { surveyHistoryKey, entryFromSurvey } from "./survey-history";
import type { NeedsSurvey } from "./needs-survey";
import { saveKarteAssignment, saveItemDelegation, loadDelegationSnapshot } from "./admin-delegation-server";
import { emptySelfReviewData, SELF_REVIEW_CONFIG_KEY } from "./self-review";
import { emptyPresurveyAnswer, isKarteLinked, loadPresurveyQuestions, visiblePresurveyQuestions } from "./one-on-one-presurvey";
import { SEED203_JIRO_ANSWERS, SEED203_JIRO_GOAL_QUESTION_IDS, SEED203_JIRO_PRESURVEY_AT, SEED203_JIRO_PRESURVEY_KEY, SEED203_JIRO_SCHEDULE, SEED203_LEGACY_PROMISE_IDS, SEED203_NOTES } from "./test-seed-203";
import { fetchGates, saveGateCheck, saveMatrixReview, saveStaffGrade, seedGates } from "./growth-matrix-server";
import { SEED_MARK, TEST_ACCOUNTS, TEST_PROSPECT_NAME, TEST_SEED_FLAG, isTestSeedUser, onlyTestIds, type TestAccountDef } from "./test-seed";
import { clearTestSeedCache } from "./test-seed-server";

type Admin = SupabaseClient;

export type SeedAccountStatus = { key: TestAccountDef["key"]; email: string; displayName: string; userId: string; exists: boolean };
export type SeedStatus = { accounts: SeedAccountStatus[]; prospect: boolean; counts: Record<string, number> };
export type SeedResult = { accounts: SeedAccountStatus[]; created: Record<string, number> };
export type PurgeResult = { deleted: Record<string, number>; foreignBlocked: string[] };

const PROSPECT_ID = "prospect-seed191-saburo";
/** private_store の種類の日本語名（削除した件数の表示用） */
const PRIVATE_LABEL: Record<string, string> = {
  self_review: "自己評価シート",
  one_on_one: "1on1の記録",
  one_on_one_presurvey: "1on1の事前アンケートの回答",
};
const H = (k: string) => `seed191-h-${k}`;
const J = (k: string) => `seed191-j-${k}`;

async function listAll(admin: Admin): Promise<User[]> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  return data?.users ?? [];
}

function findByEmail(users: User[], email: string): User | undefined {
  return users.find((u) => (u.email ?? "").toLowerCase() === email);
}

async function upsertGrowth(admin: Admin, recordType: string, id: string, data: Record<string, unknown>, by: string): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).upsert({ id, record_type: recordType, data: { ...data, [SEED_MARK]: true }, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

async function upsertPrivate(admin: Admin, ownerId: string, contentType: string, recordKey: string, data: Record<string, unknown>): Promise<void> {
  const { error } = await admin
    .from("private_store")
    .upsert({ owner_id: ownerId, content_type: contentType, record_key: recordKey, data: { ...data, [SEED_MARK]: true }, updated_at: new Date().toISOString() }, { onConflict: "owner_id,content_type,record_key" });
  if (error) throw new Error(error.message);
}

// ─── 状態 ───

export async function testSeedStatus(admin: Admin): Promise<SeedStatus> {
  const users = await listAll(admin);
  const accounts: SeedAccountStatus[] = TEST_ACCOUNTS.map((a) => {
    const u = findByEmail(users, a.email);
    return { key: a.key, email: a.email, displayName: a.displayName, userId: u?.id ?? "", exists: !!u && isTestSeedUser(u) };
  });
  const { prospects } = await fetchProspects(admin).catch(() => ({ prospects: [] }));
  const counts = await countTargets(admin, new Set(accounts.filter((a) => a.exists).map((a) => a.userId))).catch(() => ({}));
  return { accounts, prospect: prospects.some((p) => p.id === PROSPECT_ID), counts };
}

// ─── 作成 ───

async function ensureAccount(admin: Admin, users: User[], def: TestAccountDef, password: string): Promise<{ user: User; created: boolean }> {
  const existing = findByEmail(users, def.email);
  if (existing) {
    // 既にある: 印・表示名・パスワードを揃え、無効化されていれば戻す
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...((existing.user_metadata ?? {}) as Record<string, unknown>), display_name: def.displayName },
      app_metadata: { ...((existing.app_metadata ?? {}) as Record<string, unknown>), [TEST_SEED_FLAG]: true },
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    return { user: data.user, created: false };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: def.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: def.displayName },
    app_metadata: { [TEST_SEED_FLAG]: true },
  });
  if (error) throw new Error(error.message);
  return { user: data.user, created: true };
}

async function ensureCourse(admin: Admin, courses: Course[], name: string, by: string): Promise<Course> {
  const norm = normalizeCourseName(name);
  const found = courses.find((c) => normalizeCourseName(c.name) === norm);
  if (found) return found;
  const now = new Date().toISOString();
  const c = normalizeCourse(newGrowthId("course"), { name, organizer: "", category: "external", status: "confirmed", hidden: false, order: 0, defaultDays: 0, createdBy: by, createdAt: now, updatedAt: now })!;
  await upsertGrowth(admin, "course", c.id, { ...c, id: undefined }, by);
  courses.push(c);
  return c;
}

const SURVEY_1: NeedsSurvey = {
  values: { survival: 40, belonging: 62, power: 48, freedom: 55, fun: 70 },
  details: { safety: { desire: 42, focus: 40, current: 50 }, health: { desire: 38, focus: 35, current: 45 }, love: { desire: 65, focus: 60, current: 55 }, belong: { desire: 60, focus: 55, current: 58 }, achievement: { desire: 50, focus: 45, current: 40 }, approval: { desire: 52, focus: 50, current: 48 }, contribution: { desire: 44, focus: 40, current: 42 }, competition: { desire: 30, focus: 25, current: 30 }, release: { desire: 55, focus: 50, current: 52 }, change: { desire: 50, focus: 45, current: 44 }, individuality: { desire: 58, focus: 52, current: 50 }, humor: { desire: 70, focus: 65, current: 68 }, curiosity: { desire: 72, focus: 66, current: 60 }, learning: { desire: 68, focus: 60, current: 58 }, creativity: { desire: 64, focus: 55, current: 52 } },
  visibility: "public_details",
  updatedAt: "2026-04-10T09:00:00.000Z",
};
const SURVEY_2: NeedsSurvey = {
  values: { survival: 38, belonging: 68, power: 52, freedom: 60, fun: 74 },
  details: { safety: { desire: 40, focus: 38, current: 52 }, health: { desire: 36, focus: 34, current: 48 }, love: { desire: 70, focus: 64, current: 60 }, belong: { desire: 66, focus: 60, current: 62 }, achievement: { desire: 54, focus: 50, current: 46 }, approval: { desire: 50, focus: 48, current: 50 }, contribution: { desire: 52, focus: 46, current: 48 }, competition: { desire: 28, focus: 24, current: 30 }, release: { desire: 58, focus: 54, current: 56 }, change: { desire: 56, focus: 50, current: 48 }, individuality: { desire: 62, focus: 56, current: 54 }, humor: { desire: 74, focus: 68, current: 70 }, curiosity: { desire: 76, focus: 70, current: 64 }, learning: { desire: 72, focus: 64, current: 62 }, creativity: { desire: 66, focus: 58, current: 56 } },
  visibility: "public_details",
  updatedAt: "2026-09-10T09:00:00.000Z",
};

const INTERVIEW_TEXT = `面接の記録（検証用・架空）2026年9月20日
応募者: テスト三郎（検証用）
本人の話:
・現住所は滋賀県草津市テスト町3-3（架空）。携帯は 000-0000-0003、メールは test-saburo@mk-training.invalid。
・2018年に架空医療事務専門学校を卒業。2018年4月から2026年8月まで架空クリニックで受付・会計を担当。
・医療事務技能認定（架空）を2019年に取得。
・志望動機は「地域の皮膚科で患者さんと長く関わりたい」。
・自己PRは「受付の待ち時間を短くする工夫を続けてきた」。
・緊急連絡先は父のテスト太郎（000-0000-0004）。
院長の所感:
・受け答えが明るく好印象（これは架空のメモ）。
`;

export async function seedTestData(admin: Admin, by: string, directorId: string, passwords: { hanako: string; jiro: string }): Promise<SeedResult> {
  const created: Record<string, number> = {};
  const bump = (k: string, n = 1) => (created[k] = (created[k] ?? 0) + n);
  const now = new Date().toISOString();
  const users = await listAll(admin);

  // 1. アカウント
  const h = await ensureAccount(admin, users, TEST_ACCOUNTS[0], passwords.hanako);
  const j = await ensureAccount(admin, users, TEST_ACCOUNTS[1], passwords.jiro);
  clearTestSeedCache();
  if (h.created) bump("アカウント");
  if (j.created) bump("アカウント");
  const hid = h.user.id;
  const jid = j.user.id;

  // 2. プロフィール（index には載せない）＋サーベイ（2回分・詳細も公開）
  const hp = { ...emptyProfile(hid, TEST_ACCOUNTS[0].displayName), role: TEST_ACCOUNTS[0].roleId, bio: "検証用の架空プロフィールです。", needsSurvey: SURVEY_2, updatedAt: now, [SEED_MARK]: true };
  const jp = { ...emptyProfile(jid, TEST_ACCOUNTS[1].displayName), role: TEST_ACCOUNTS[1].roleId, bio: "検証用の架空プロフィールです。", updatedAt: now, [SEED_MARK]: true };
  if (!(await serverPutContentRow(staffProfileKey(hid), "staff", hp, by))) throw new Error("プロフィールを保存できませんでした");
  if (!(await serverPutContentRow(staffProfileKey(jid), "staff", jp, by))) throw new Error("プロフィールを保存できませんでした");
  bump("プロフィール", 2);
  const entry1 = entryFromSurvey(SURVEY_1, "2026-09-10T08:59:00.000Z");
  if (entry1) {
    entry1.id = "sv-seed191-1";
    await saveSurveyHistory(hid, [entry1]);
  }
  bump("サーベイ（現在＋履歴）", 2);

  // 3. 担当幹部の指定（183）
  await saveKarteAssignment(jid, [hid], by);
  bump("担当幹部の指定");

  // 4. 連絡先（169）
  const { contacts } = await fetchAllStaffContacts(admin);
  const prevC = contacts.find((c) => c.userId === hid);
  const contact = normalizeStaffContact(prevC?.id ?? "contact-seed191-hanako", {
    userId: hid,
    name: TEST_ACCOUNTS[0].displayName,
    kana: "てすと はなこ",
    address: "滋賀県草津市テスト町1-1（架空）",
    phoneMobile: "000-0000-0000",
    phoneHome: "",
    privateEmail: "test-hanako@mk-training.invalid",
    birthday: "2000-01-01",
    joinedOn: "2026-04-01",
    memo: "検証用の架空データ",
    emergency: [{ name: "テスト太郎（架空）", relation: "父", phone: "000-0000-0001", memo: "" }],
    family: [{ relation: "配偶者", count: "1", memo: "" }],
    createdAt: prevC?.createdAt || now,
    updatedAt: now,
  })!;
  await saveStaffContactRow(admin, contact, by, !prevC);
  await recordStaffContactLog(admin, { by, action: "検証用データを登録", target: contact.name, changes: [] });
  bump("連絡先");

  // 5. 講座と学びの記録
  const { courses } = await fetchCourses(admin);
  const atc = await ensureCourse(admin, courses, "アチーブメント テクノロジーコース（ATC）", by);
  const dyn = await ensureCourse(admin, courses, "アチーブメント ダイナミックコース", by);
  const lm = await ensureCourse(admin, courses, "リードマネジメントセミナー", by);
  const learn = async (id: string, userId: string, courseId: string, dates: string[], learned: string) => {
    const r = normalizeLearning(id, { userId, courseId, dates, startDate: dates[0], endDate: dates[dates.length - 1], venueType: "venue", venueName: "架空会場", learned, nextAction: "学んだことを朝礼で共有する", tags: ["検証用"], evidence: [], createdBy: userId, createdAt: now, updatedAt: now })!;
    await upsertGrowth(admin, "learning", id, { ...r, id: undefined }, by);
    bump("学びの記録");
  };
  await learn(H("learn-atc1"), hid, atc.id, ["2026-05-15", "2026-05-16", "2026-05-17"], "目的を明確にすることの大切さを学んだ（検証用）");
  await learn(H("learn-atc2"), hid, atc.id, ["2026-09-05", "2026-09-06", "2026-09-07"], "2回目。前回より計画の立て方が具体的になった（検証用）");
  await learn(J("learn-atc"), jid, atc.id, ["2025-06-20", "2025-06-21", "2025-06-22"], "検証用");
  await learn(J("learn-dyn"), jid, dyn.id, ["2025-11-08", "2025-11-09"], "検証用");
  await learn(J("learn-lm"), jid, lm.id, ["2026-02-14"], "検証用");

  // 6. 目標（目的 → 3年後 → 年間 → 半期 → 月 → 週）
  const goal = async (id: string, level: string, parentId: string, title: string, detail: string, extra: Record<string, unknown> = {}) => {
    const g = normalizeGoal(id, { userId: hid, level, parentId, title, detail, why: "検証用", jitsu: ["jikko"], axes: ["skill"], achievedState: "", status: "active", dueDate: "", support: "", supportBy: "", comments: [], review: "", agreedOn: "", agreedBy: "", agreedByName: "", fromLearningId: "", createdAt: now, updatedAt: now, ...extra })!;
    await upsertGrowth(admin, "goal", id, { ...g, id: undefined }, by);
    bump("目標");
  };
  await goal(H("goal-purpose"), "purpose", "", "患者さんに安心してもらえる看護師になる（検証用）", "なぜ働くのか: 人の役に立つ実感を持ちたい");
  await goal(H("goal-3y"), "three_year", H("goal-purpose"), "3年後にG2として一人で外来を回せる（検証用）", "");
  await goal(H("goal-annual"), "annual", H("goal-3y"), "保険診療の基本処置を一人で正確に行える（検証用）", "", { agreedOn: "2026-04-15", agreedBy: directorId, agreedByName: "院長" });
  await goal(H("goal-half"), "half", H("goal-annual"), "上期: 基本処置10種を一人で担当する（検証用）", "", { agreedOn: "2026-04-15", agreedBy: directorId, agreedByName: "院長" });
  await goal(H("goal-month"), "monthly", H("goal-half"), "今月: 処置の手順書を3つ読み合わせる（検証用）", "");
  await goal(H("goal-week"), "weekly", H("goal-month"), "今週: 先輩の処置を2回見学する（検証用）", "");

  // 7. 1on1の記録と、約束の取り組み状況・次回の予定・事前アンケートの回答（191＋指示書203 §2）
  //
  // 入れる値の正本は test-seed-203.ts（純粋データ）。ここは書き込むだけ。
  //   ・記録は1on1ノートの「クイックメモ」の3欄（話したテーマ／気づき・学び／次の一歩）に入れる
  //     ＝実在する欄に合わせる（203 §2）。RWDEPCの5欄はクイックメモでは画面に出ないので使わない
  //   ・7つの実チェックはその回の内容と矛盾しないものを1〜2項目だけ（点数・人物評価の言葉は入れない）
  //   ・既存の6/1・9/1の内容は変えない
  const idOf = { hanako: hid, jiro: jid, director: directorId } as const;
  const nameOfSeed = { hanako: TEST_ACCOUNTS[0].displayName, jiro: TEST_ACCOUNTS[1].displayName, director: "院長" } as const;

  for (const n of SEED203_NOTES) {
    const ownerId = idOf[n.author];
    const partnerId = idOf[n.staff];
    await upsertPrivate(admin, ownerId, "one_on_one", n.key, {
      mode: "quick",
      heldOn: n.heldOn,
      participantIds: [partnerId],
      partnerName: nameOfSeed[n.staff],
      authorName: nameOfSeed[n.author],
      sections: { ...n.sections },
      jitsuChecks: [...n.jitsuChecks],
      rwdepc: { w: "", d: "", e: "", p: "", c: "" },
      createdAt: `${n.heldOn}T09:00:00.000Z`,
      updatedAt: `${n.heldOn}T09:00:00.000Z`,
    });
    bump("1on1");
  }

  // 約束の取り組み状況。
  // 行idは**本人が画面から書いたときと同じ形**（promiseStatusId）にそろえる。
  // 191の初版は seed191-h-promise-N で、本人が取り組み状況を書くとAPIが別idの行を作り、
  // 同じ回に2行できてしまっていた。初版の行は片付ける（検証用の印が付いた行だけ）。
  for (const legacyId of SEED203_LEGACY_PROMISE_IDS) {
    const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", legacyId).eq("record_type", "promise");
    if (error) throw new Error(error.message);
  }
  for (const n of SEED203_NOTES) {
    const userId = idOf[n.staff];
    const ownerId = idOf[n.author];
    const status: PromiseStatusValue = n.promise.status;
    await upsertGrowth(admin, "promise", promiseStatusId(userId, ownerId, n.key), { userId, oneOnOneKey: n.key, ownerId, status, note: n.promise.note, updatedAt: now }, by);
    bump("1on1の約束の取り組み状況");
  }

  // 203 §2-2 テスト次郎の次回1on1の予定（相手：院長）。179のテーブル（record_type="schedule"）に
  // 検証用の印を付けて入れる＝一括削除の対象一覧に入る
  await upsertGrowth(admin, "schedule", SEED203_JIRO_SCHEDULE.id, {
    userId: jid,
    date: SEED203_JIRO_SCHEDULE.date,
    time: SEED203_JIRO_SCHEDULE.time,
    partnerId: directorId,
    partnerName: "院長",
    partnerIsDirector: true,
    createdById: directorId,
    registeredOn: SEED203_JIRO_SCHEDULE.registeredOn,
    createdAt: SEED203_JIRO_SCHEDULE.at,
    updatedAt: SEED203_JIRO_SCHEDULE.at,
  }, by);
  bump("次回1on1の予定");

  // 回答は**いまの質問定義**に合わせて作る（院長が質問文を直していればその文言で保存される）。
  // 197の規則どおり、回答時点の質問文・役割・置き場所を一緒に保存する。
  // 選択肢はその質問に実在するものだけ使う（院長が選択肢を変えていても壊れない）。
  const presurveyQuestions = await loadPresurveyQuestions();
  const presurveyAnswers = visiblePresurveyQuestions(presurveyQuestions)
    .filter((q) => SEED203_JIRO_ANSWERS[q.id])
    .map((q) => {
      const v = SEED203_JIRO_ANSWERS[q.id];
      return {
        ...emptyPresurveyAnswer(q),
        choice: v.choice && q.choices.includes(v.choice) ? v.choice : "",
        text: v.text ?? "",
      };
    });
  await upsertPrivate(admin, jid, "one_on_one_presurvey", SEED203_JIRO_PRESURVEY_KEY, {
    heldOn: SEED203_JIRO_SCHEDULE.date,
    scheduleId: SEED203_JIRO_SCHEDULE.id,
    participantIds: [directorId],
    partnerName: "院長",
    authorName: TEST_ACCOUNTS[1].displayName,
    answers: presurveyAnswers,
    submittedAt: SEED203_JIRO_PRESURVEY_AT,
    createdAt: SEED203_JIRO_PRESURVEY_AT,
    updatedAt: SEED203_JIRO_PRESURVEY_AT,
  });
  bump("1on1の事前アンケートの回答");

  // 204 §7: 第1部はカルテの目標そのもの。テスト次郎のカルテの目標も同じ文章で作る（検証用の印つき）。
  // 行idは固定なので、何度「作成」しても重複しない。
  const jiroGoalLevels = new Map(
    visiblePresurveyQuestions(presurveyQuestions)
      .filter(isKarteLinked)
      .map((q) => [q.id, q.karteLevel as string])
  );
  for (const qid of SEED203_JIRO_GOAL_QUESTION_IDS) {
    const level = jiroGoalLevels.get(qid);
    const title = SEED203_JIRO_ANSWERS[qid]?.text ?? "";
    if (!level || !title) continue;
    const g = normalizeGoal(J(`goal-${level}`), {
      userId: jid,
      level,
      parentId: "",
      title,
      detail: "",
      why: "",
      jitsu: [],
      axes: [],
      achievedState: "",
      status: "active",
      dueDate: "",
      support: "",
      supportBy: "",
      comments: [],
      review: "",
      agreedOn: "",
      agreedBy: "",
      agreedByName: "",
      fromLearningId: "",
      createdAt: now,
      updatedAt: now,
    });
    if (!g) continue;
    await upsertGrowth(admin, "goal", g.id, { ...g, id: undefined }, by);
    bump("目標");
  }
  // テスト花子の10/13の予定と、その未回答の事前アンケートは**作らない**（203 §2）。
  // 院長が197の知らせ・回答を自分で試すため、未回答のままにしておく。

  // 8. フィードバック（ポジティブ2件・ギャップ1件）
  const fb = async (id: string, raw: Record<string, unknown>) => {
    const f = normalizeFeedback(id, { userId: hid, createdAt: now, updatedAt: now, seenAt: "", ...raw })!;
    await upsertGrowth(admin, "feedback", id, { ...f, id: undefined }, by);
    bump("フィードバック");
  };
  await fb(H("fb-pos1"), { authorId: directorId, authorName: "院長", type: "positive", date: "2026-07-03", scene: "朝礼での共有（検証用）", approval: "action", whatGood: "学んだことを自分の言葉で3分にまとめて共有していた", viewpoints: ["jikko", "wakachiai"], reaction: "嬉しかったです（検証用）" });
  await fb(H("fb-pos2"), { authorId: jid, authorName: TEST_ACCOUNTS[1].displayName, type: "positive", date: "2026-08-20", scene: "受付の混雑時（検証用）", approval: "thanks", whatGood: "自分から受付の応援に入ってくれた", viewpoints: ["kansha"], reaction: "" });
  await fb(H("fb-gap1"), { authorId: directorId, authorName: "院長", type: "gap", date: "2026-08-25", scene: "処置室（検証用）", fact: "処置の準備で器具が1つ足りず、患者さんを2分待たせた", iMessage: "準備の確認を一緒に仕組みにしたいと思った", issue: "準備リストが頭の中だけで、確認の手順が無かったこと", plan: "処置ごとの準備リストを作り、開始前に指差し確認する", planDue: "2026-09-30", nextCheckOn: "2026-10-01", result: "", progress: "リストを3つ作成。指差し確認を始めた（検証用）" });

  // 9. 自己評価シート（位置・次に伸ばす軸・G1→G2 の到達状態）
  const cfgRow = await serverGetContentRow(SELF_REVIEW_CONFIG_KEY);
  const period = (typeof (cfgRow?.data as { currentPeriod?: unknown } | null)?.currentPeriod === "string" && (cfgRow!.data as { currentPeriod: string }).currentPeriod) || "2026";
  const hs = emptySelfReviewData();
  hs.grade = "G1";
  hs.name = TEST_ACCOUNTS[0].displayName;
  hs.period_label = `${period}年度`;
  hs.sections.minori.jikkou = "決めたことを最後までやりきった（検証用）";
  hs.sections.rank = { value: "B", reason: "検証用" };
  hs.matrix = {
    s: "S1",
    m: "M1",
    transition: "g1_g2",
    nextAxis: "s",
    nextAxisReason: "まず基本処置を一人でできるようになりたい（検証用）",
    items: {
      "g1_g2:s:3": { status: "reached", evidence: [{ date: "2026-08-30", scene: "任された手順書3つを期限までに作りきった（検証用）", linkKind: "", linkId: "", linkLabel: "" }] },
      "g1_g2:m:1": { status: "reached", evidence: [{ date: "2026-06-01", scene: "1on1で迷いを自分から報告した（検証用）", linkKind: "promise", linkId: SEED203_NOTES[0].key, linkLabel: "1on1の約束: 迷ったら5分以内に先輩に声をかける" }] },
      "g1_g2:s:1": { status: "in_progress", evidence: [] },
      "g1_g2:s:2": { status: "in_progress", evidence: [] },
      "g1_g2:m:2": { status: "in_progress", evidence: [] },
    },
  };
  await upsertPrivate(admin, hid, "self_review", period, { ...hs });
  const js = emptySelfReviewData();
  js.grade = "G3";
  js.name = TEST_ACCOUNTS[1].displayName;
  js.period_label = `${period}年度`;
  js.matrix = { s: "S3", m: "M3", transition: "g3_g4", nextAxis: "m", nextAxisReason: "検証用", items: {} };
  await upsertPrivate(admin, jid, "self_review", period, { ...js });
  bump("自己評価シート", 2);

  // 10. 等級・ゲートの確認・合意した位置
  await saveStaffGrade(admin, { userId: hid, grade: "G1", careerLine: TEST_ACCOUNTS[0].careerLine, updatedAt: "", updatedBy: by }, by);
  await saveStaffGrade(admin, { userId: jid, grade: "G3", careerLine: TEST_ACCOUNTS[1].careerLine, updatedAt: "", updatedBy: by }, by);
  bump("等級・キャリアライン", 2);
  await seedGates(admin, by);
  const { gates } = await fetchGates(admin);
  const safety = gates.find((g) => g.transition === "g1_g2" && g.label.includes("医療安全"));
  if (safety) {
    await saveGateCheck(admin, { userId: hid, gateId: safety.id, ok: true, checkedOn: "2026-05-20", note: "院内研修の受講と理解度の確認（検証用）", by });
    bump("ゲートの確認");
  }
  await saveMatrixReview(admin, { userId: hid, itemReviews: { "g1_g2:s:3": "confirmed", "g1_g2:m:1": "dialogue" }, agreed: [{ s: "S1", m: "M1", meeting: "half", date: "2026-07-15", by, note: "検証用" }], updatedAt: "", updatedBy: by }, by);
  bump("合意した位置");

  // 11. 入職予定者（テスト三郎）＋面接の記録（文章）
  const prospect = normalizeProspect(PROSPECT_ID, { name: TEST_PROSPECT_NAME, email: "test-saburo@mk-training.invalid", expectedJoinOn: "2026-11-01", status: "expected", linkedUserId: "", memo: "検証用の架空データ", createdAt: now, updatedAt: now })!;
  await saveProspect(admin, prospect, by);
  bump("入職予定者");
  await ensureHiringBucket(admin);
  const docId = "hdoc-seed191-interview";
  const path = `${PROSPECT_ID}/${docId}.txt`;
  const { error: upErr } = await admin.storage.from(HIRING_BUCKET).upload(path, Buffer.from(INTERVIEW_TEXT, "utf8"), { contentType: "text/plain", upsert: true });
  if (upErr) throw new Error(`面接の記録を保存できませんでした: ${upErr.message}`);
  const doc = normalizeHiringDoc(docId, { userId: PROSPECT_ID, kind: "interview", docDate: "2026-09-20", memo: "検証用の架空データ", path, fileName: "2026-09-20-面接の記録（検証用）.txt", mimeType: "text/plain", size: Buffer.byteLength(INTERVIEW_TEXT), uploadedBy: by, createdAt: now })!;
  await saveHiringDoc(admin, doc, by);
  bump("面接の記録");

  await recordGrowthLog(admin, { by, action: "検証用データを作成", kind: "検証用", target: "テスト花子・テスト次郎・テスト三郎", changes: Object.entries(created).map(([k, v]) => ({ field: k, before: "", after: `${v}件` })) });
  await recordHiringLog(admin, { by, action: "検証用データを作成", target: PROSPECT_ID, changes: [] });

  return {
    accounts: [
      { key: "hanako", email: TEST_ACCOUNTS[0].email, displayName: TEST_ACCOUNTS[0].displayName, userId: hid, exists: true },
      { key: "jiro", email: TEST_ACCOUNTS[1].email, displayName: TEST_ACCOUNTS[1].displayName, userId: jid, exists: true },
    ],
    created,
  };
}

// ─── 削除の対象一覧 ───

type Targets = {
  testIds: Set<string>;
  growth: { id: string; record_type: string; userId: string }[];
  privateRows: { owner_id: string; content_type: string; record_key: string }[];
  contactIds: string[];
  hiringDocs: Awaited<ReturnType<typeof fetchHiringDocs>>["docs"];
  prospectIds: string[];
  contentKeys: string[];
  seedCourseIds: string[];
  karteManagers: string[];
  /** 207: 検証用アカウントが指名されている管理画面の項目（委任） */
  itemDelegations: string[];
};

async function collectTargets(admin: Admin, testIds: Set<string>): Promise<{ targets: Targets; foreign: string[] }> {
  const foreign: string[] = [];
  const idsWithProspect = new Set([...testIds, PROSPECT_ID]);
  // clinic_staff_growth: 検証用の userId か、seed191 の印
  const growth: Targets["growth"] = [];
  const seedCourseIds: string[] = [];
  const { data: gRows, error: gErr } = await admin.from(GROWTH_TABLE).select("id, record_type, data").or(`data->>${SEED_MARK}.eq.true,data->>userId.in.(${Array.from(testIds).map((x) => `"${x}"`).join(",") || '""'})`);
  if (gErr && !/does not exist|schema cache/i.test(gErr.message)) throw new Error(gErr.message);
  for (const r of (gRows ?? []) as { id: string; record_type: string; data: Record<string, unknown> | null }[]) {
    const userId = typeof r.data?.userId === "string" ? r.data.userId : "";
    if (r.record_type === "course") {
      if (r.data?.[SEED_MARK] === true) seedCourseIds.push(String(r.id));
      continue;
    }
    if (r.record_type === "log") continue; // 操作ログは残す（本文は無い）
    if (userId && !testIds.has(userId)) {
      foreign.push(`${r.record_type}:${r.id}`);
      continue;
    }
    growth.push({ id: String(r.id), record_type: r.record_type, userId });
  }
  // private_store: 検証用が owner か、seed191 の印（院長が記録した1on1）で参加者が検証用だけ
  const privateRows: Targets["privateRows"] = [];
  const { data: pRows, error: pErr } = await admin.from("private_store").select("owner_id, content_type, record_key, data").or(`data->>${SEED_MARK}.eq.true,owner_id.in.(${Array.from(testIds).map((x) => `"${x}"`).join(",") || '""'})`);
  if (pErr && !/does not exist|schema cache/i.test(pErr.message)) throw new Error(pErr.message);
  for (const r of (pRows ?? []) as { owner_id: string; content_type: string; record_key: string; data: Record<string, unknown> | null }[]) {
    if (testIds.has(r.owner_id)) {
      privateRows.push(r);
      continue;
    }
    const parts = Array.isArray(r.data?.participantIds) ? (r.data!.participantIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const chk = onlyTestIds(parts, testIds);
    if (r.data?.[SEED_MARK] === true && parts.length > 0 && chk.ok) privateRows.push(r);
    else foreign.push(`private:${r.content_type}:${r.record_key}`);
  }
  // 連絡先
  const { contacts } = await fetchAllStaffContacts(admin).catch(() => ({ contacts: [] }));
  const contactIds = contacts.filter((c) => idsWithProspect.has(c.userId)).map((c) => c.id);
  // 採用資料・入職予定者
  const docs: Targets["hiringDocs"] = [];
  for (const uid of idsWithProspect) {
    const { docs: d } = await fetchHiringDocs(admin, uid).catch(() => ({ docs: [] }));
    docs.push(...d);
  }
  const { prospects } = await fetchProspects(admin).catch(() => ({ prospects: [] }));
  const prospectIds = prospects.filter((p) => p.id === PROSPECT_ID || p.memo === "検証用の架空データ").map((p) => p.id);
  // content_store（プロフィール・サーベイ履歴）
  const contentKeys: string[] = [];
  for (const uid of testIds) contentKeys.push(staffProfileKey(uid), surveyHistoryKey(uid));
  // 担当幹部の指定
  const snap = await loadDelegationSnapshot();
  const karteManagers = Object.keys(snap.karte).filter((m) => testIds.has(m) || (snap.karte[m] ?? []).some((s) => testIds.has(s)));
  // 207-4: 管理画面の委任（検証用アカウントが指名されている項目）も対象にする
  const itemDelegations = Object.keys(snap.items).filter((k) => (snap.items[k] ?? []).some((u) => testIds.has(u)));
  return { targets: { testIds, growth, privateRows, contactIds, hiringDocs: docs, prospectIds, contentKeys, seedCourseIds, karteManagers, itemDelegations }, foreign };
}

async function countTargets(admin: Admin, testIds: Set<string>): Promise<Record<string, number>> {
  if (testIds.size === 0) return {};
  const { targets } = await collectTargets(admin, testIds);
  const byType: Record<string, number> = {};
  for (const g of targets.growth) byType[g.record_type] = (byType[g.record_type] ?? 0) + 1;
  // 203 §3-8: 1on1の記録・事前アンケートの回答・自己評価を**種類ごと**に出す
  // （private_store のまとめ数だけでは「回答が対象に入っているか」が分からない）
  for (const r of targets.privateRows) {
    const k = `private:${r.content_type}`;
    byType[k] = (byType[k] ?? 0) + 1;
  }
  return {
    ...byType,
    private_store: targets.privateRows.length,
    contacts: targets.contactIds.length,
    hiring_docs: targets.hiringDocs.length,
    prospects: targets.prospectIds.length,
    // 207-4: 委任と担当の指定も対象一覧に出す（消えることが院長に見えるように）
    karte_assignment: targets.karteManagers.length,
    item_delegation: targets.itemDelegations.length,
  };
}

// ─── 一括削除 ───

export async function purgeTestData(admin: Admin, by: string): Promise<PurgeResult> {
  const users = await listAll(admin);
  const testUsers = users.filter((u) => isTestSeedUser(u));
  const testIds = new Set(testUsers.map((u) => u.id));
  const { targets, foreign } = await collectTargets(admin, testIds);
  // 検証用以外が対象一覧に混ざっていたら、何も消さずに止める
  if (foreign.length > 0) return { deleted: {}, foreignBlocked: foreign };
  const deleted: Record<string, number> = {};
  const add = (k: string, n: number) => {
    if (n > 0) deleted[k] = (deleted[k] ?? 0) + n;
  };

  // 1. 育成カルテの記録
  for (const g of targets.growth) {
    const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", g.id).eq("record_type", g.record_type);
    if (error) throw new Error(error.message);
    add(`記録（${g.record_type}）`, 1);
  }
  // 2. private_store（自己評価・1on1）
  for (const r of targets.privateRows) {
    const { error } = await admin.from("private_store").delete().eq("owner_id", r.owner_id).eq("content_type", r.content_type).eq("record_key", r.record_key);
    if (error) throw new Error(error.message);
    add(PRIVATE_LABEL[r.content_type] ?? r.content_type, 1);
  }
  // 3. 連絡先
  for (const id of targets.contactIds) {
    await deleteStaffContactRow(admin, id);
    add("連絡先", 1);
  }
  // 4. 採用資料（実体も）・入職予定者
  for (const d of targets.hiringDocs) {
    await deleteHiringDoc(admin, d);
    add("採用資料（面接の記録）", 1);
  }
  for (const id of targets.prospectIds) {
    await deleteProspectRow(admin, id);
    add("入職予定者", 1);
  }
  // scouter / gate_check / matrix_review / grade は 1 で消えている（data.userId が検証用）
  // 5. content_store（プロフィール・サーベイ履歴）と index からの除去
  for (const key of targets.contentKeys) {
    if (await serverDeleteContentRow(key)) add("プロフィール・サーベイ", 1);
  }
  const idx = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
  const items = (idx?.data as { items?: unknown[] } | null)?.items;
  if (Array.isArray(items)) {
    const next = items.filter((it) => !(it && typeof it === "object" && testIds.has(String((it as { userId?: unknown }).userId ?? ""))));
    if (next.length !== items.length) {
      await serverPutContentRow(STAFF_PROFILES_INDEX_KEY, "staff", { ...(idx!.data as Record<string, unknown>), items: next }, by);
      add("メンバー一覧からの除去", items.length - next.length);
    }
  }
  // 6. 担当幹部の指定
  const snap = await loadDelegationSnapshot();
  for (const m of targets.karteManagers) {
    const rest = testIds.has(m) ? [] : (snap.karte[m] ?? []).filter((s) => !testIds.has(s));
    await saveKarteAssignment(m, rest, by);
    add("担当幹部の指定", 1);
  }
  // 6-2. 管理画面の委任（207-4）。検証用アカウントのidだけを外す（実在の幹部の指名は残す）
  for (const key of targets.itemDelegations) {
    const rest = (snap.items[key] ?? []).filter((u) => !testIds.has(u));
    const ok = await saveItemDelegation(key, rest, by);
    if (!ok) throw new Error(`管理画面の委任（${key}）の削除に失敗しました`);
    add("管理画面の委任", 1);
  }
  // 7. 検証用に作った講座（他の学びの記録が参照していなければ）
  if (targets.seedCourseIds.length > 0) {
    const { records } = await fetchLearning(admin);
    for (const cid of targets.seedCourseIds) {
      if (records.some((r) => r.courseId === cid && !testIds.has(r.userId))) continue;
      const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", cid).eq("record_type", "course");
      if (error) throw new Error(error.message);
      add("講座（検証用に作ったもの）", 1);
    }
  }
  // 8. アカウント
  for (const u of testUsers) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(error.message);
    add("アカウント", 1);
  }
  clearTestSeedCache();
  await recordGrowthLog(admin, { by, action: "検証用データを削除（削除用パスワード照合済み）", kind: "検証用", target: Array.from(testIds).join(","), changes: Object.entries(deleted).map(([k, v]) => ({ field: k, before: `${v}件`, after: "0件" })) });
  await recordHiringLog(admin, { by, action: "検証用データを削除", target: PROSPECT_ID, changes: [] });
  return { deleted, foreignBlocked: [] };
}

export { PROSPECT_ID as TEST_PROSPECT_ID };
