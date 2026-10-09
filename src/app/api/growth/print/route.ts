// 印刷用表示のデータ（指示書195）— ログイン済み。**画面と同じ権限判定をサーバー側で通す**（印刷用が抜け道にならない・179 A-2）
//   GET ?user=<userId>&sections=a,b,c&log=1
//     ・院長: 誰でも・全項目。担当幹部: 担当スタッフだけ・183/185の範囲（現在地・機微な項目は不可）。本人: 自分だけ・フラグ growth_record ON のとき
//     ・許可されない項目は黙って落とす（available に許可された項目を返す）
//     ・log=1 かつ他人のカルテ → 誰が・誰の・いつ・どの項目を記録（本文なし・院長のみ閲覧の操作ログ）。本人の印刷は記録しない

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff, fetchFeedback, fetchGoals, fetchGrowthPref, fetchLearning, fetchCourses, recordGrowthLog } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { buildKarteDetail, type KarteScope } from "@/lib/staff-growth-karte-server";
import { buildPosition } from "@/lib/growth-matrix-server";
import { fetchHiringDocs, fetchHiringProfile } from "@/lib/hiring-docs-server";
import { fetchScouterResults } from "@/lib/scouter-server";
import { fetchAllStaffContacts } from "@/lib/staff-contacts-server";
import { allowedPrintSections, parsePrintSections, printSectionLabel, type PrintRole } from "@/lib/growth-print";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const sp = new URL(req.url).searchParams;
  const target = sp.get("user") || auth.userId;
  const isSelf = target === auth.userId;
  // 画面と同じ判定: 本人はフラグON（selfAllowed）、他人は院長か担当幹部（canViewStaff）
  if (isSelf ? !auth.selfAllowed && !auth.isAdmin : !canViewStaff(auth, target)) return hidden();
  const role: PrintRole = auth.isAdmin ? "admin" : isSelf ? "self" : "delegate";
  const allowed = allowedPrintSections(role);
  const sections = parsePrintSections(sp.get("sections")).filter((k) => allowed.includes(k));
  try {
    // 年表・1on1・サーベイ・学びは育成カルテと同じ集め方（幹部・本人は delegate 範囲＝院長だけの記録を集めない）
    const scope: KarteScope = role === "admin" ? { mode: "full" } : { mode: "delegate", staffIds: [target] };
    const detail = await buildKarteDetail(auth.admin, auth.userId, target, scope);
    if (!detail) return auth.isAdmin ? NextResponse.json({ error: "対象が見つかりません" }, { status: 404 }) : hidden();
    const today = jstTodayYmd();
    const out: Record<string, unknown> = {
      entry: detail.entry,
      role,
      viewerName: auth.userName || auth.userEmail,
      today,
      available: allowed,
      sections,
    };
    if (sections.includes("position") || sections.includes("transition")) {
      out.position = await buildPosition(auth.admin, target, today);
    }
    if (sections.includes("goals")) {
      const [{ goals }, pref] = await Promise.all([fetchGoals(auth.admin, target), fetchGrowthPref(auth.admin, target)]);
      out.goals = goals;
      out.pace = pref.pace;
    }
    if (sections.includes("oneonone")) {
      // 幹部は自分が記録したFBだけ（185）。本人・院長は本人あての全件
      const { feedback } = await fetchFeedback(auth.admin, role === "delegate" ? { userId: target, authorId: auth.userId } : { userId: target });
      out.feedback = feedback;
      out.latestPromise = detail.latestPromise;
      out.oneOnOne = detail.timeline.filter((t) => t.kind === "one_on_one");
    }
    if (sections.includes("learning")) {
      const [{ records }, { courses }] = await Promise.all([fetchLearning(auth.admin, target), fetchCourses(auth.admin)]);
      out.learning = records.map(({ evidence: _e, ...r }) => {
        void _e;
        return r;
      });
      out.courses = courses.map((c) => ({ id: c.id, name: c.name }));
    }
    if (sections.includes("survey")) out.survey = detail.timeline.filter((t) => t.kind === "survey");
    if (sections.includes("timeline")) out.timeline = detail.timeline;
    if (role === "admin") {
      if (sections.includes("hiring")) {
        const [profile, { docs }] = await Promise.all([fetchHiringProfile(auth.admin, target), fetchHiringDocs(auth.admin, target)]);
        out.hiring = { profile, docs: docs.map((d) => ({ kind: d.kind, docDate: d.docDate, memo: d.memo, fileName: d.fileName })) };
      }
      if (sections.includes("scouter")) out.scouter = (await fetchScouterResults(auth.admin, target)).results;
      if (sections.includes("contacts")) {
        const { contacts } = await fetchAllStaffContacts(auth.admin);
        out.contact = contacts.find((c) => c.userId === target) ?? null;
      }
    }
    // D: 他人のカルテを印刷用に表示したら記録（誰が・誰の・いつ・どの項目。本文なし）。本人は記録しない
    if (!isSelf && sp.get("log") === "1") {
      await recordGrowthLog(auth.admin, {
        by: auth.userEmail || auth.userId,
        action: "印刷用に表示",
        kind: "可能性ノート",
        target: detail.entry.name,
        changes: [{ field: "項目", before: "", after: sections.map(printSectionLabel).join("・") || "なし" }],
      });
    }
    return NextResponse.json(out);
  } catch (e) {
    return growthErrorResponse(e);
  }
}
