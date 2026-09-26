// スタッフ育成カルテ系API（/api/growth/*）のクライアント呼び出しヘルパ（指示書179）
// 画面側はこのファイルの関数だけを呼ぶ（fetch の直書きをしない）。

import type {
  Course,
  Goal,
  GrowthConfig,
  GrowthLog,
  KarteDetail,
  KarteListEntry,
  LearningRecord,
  PromiseStatus,
  PromiseStatusValue,
  SearchHit,
} from "./staff-growth";

async function callApi<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const j = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    tableMissing?: boolean;
    bucketMissing?: boolean;
  };
  if (!res.ok) {
    const e = new Error(j.error || `通信に失敗しました (${res.status})`) as Error & {
      status?: number;
      tableMissing?: boolean;
      bucketMissing?: boolean;
    };
    e.status = res.status;
    e.tableMissing = j.tableMissing;
    e.bucketMissing = j.bucketMissing;
    throw e;
  }
  return j;
}

// ─── 講座マスタ ───

export async function fetchCoursesApi(): Promise<{
  courses: Course[];
  tableMissing: boolean;
  isAdmin: boolean;
}> {
  return callApi("/api/growth/courses");
}

export type CourseInput = Pick<Course, "name" | "organizer" | "category"> & {
  status?: Course["status"];
};

export async function createCourseApi(
  input: CourseInput
): Promise<{ course: Course; existed: boolean }> {
  return callApi("/api/growth/courses", { method: "POST", body: JSON.stringify(input) });
}

export async function patchCourseApi(
  id: string,
  input: Partial<CourseInput>
): Promise<{ course: Course }> {
  return callApi("/api/growth/courses", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
}

export async function deleteCourseApi(id: string): Promise<void> {
  await callApi("/api/growth/courses?id=" + encodeURIComponent(id), { method: "DELETE" });
}

export async function mergeCourseApi(
  fromId: string,
  intoId: string
): Promise<{ moved: number; into: Course }> {
  return callApi("/api/growth/courses/merge", {
    method: "POST",
    body: JSON.stringify({ fromId, intoId }),
  });
}

// ─── 学びの記録 ───

export type LearningListResponse = {
  records: LearningRecord[];
  courses: Course[];
  tableMissing: boolean;
  bucketMissing: boolean;
  isAdmin: boolean;
  userId: string;
  aiDraftEnabled: boolean;
};

export async function fetchLearningApi(userId?: string): Promise<LearningListResponse> {
  const q = userId ? `?user=${encodeURIComponent(userId)}` : "";
  return callApi(`/api/growth/learning${q}`);
}

export type LearningInput = Pick<
  LearningRecord,
  "courseId" | "startDate" | "endDate" | "venueType" | "venueName" | "learned" | "nextAction" | "tags"
>;

export async function createLearningApi(
  input: LearningInput,
  userId?: string
): Promise<{ record: LearningRecord }> {
  return callApi("/api/growth/learning", {
    method: "POST",
    body: JSON.stringify(userId ? { ...input, userId } : input),
  });
}

export async function patchLearningApi(
  id: string,
  input: Partial<LearningInput>
): Promise<{ record: LearningRecord }> {
  return callApi("/api/growth/learning", {
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
}

export async function deleteLearningApi(id: string): Promise<void> {
  await callApi("/api/growth/learning?id=" + encodeURIComponent(id), { method: "DELETE" });
}

export async function uploadEvidenceApi(
  learningId: string,
  files: Blob[]
): Promise<{ record: LearningRecord }> {
  const form = new FormData();
  form.set("learningId", learningId);
  files.forEach((f, i) => form.append("files", f, `evidence-${i}.jpg`));
  return callApi("/api/growth/learning/evidence", { method: "POST", body: form });
}

export async function deleteEvidenceApi(
  learningId: string,
  path: string
): Promise<{ record: LearningRecord }> {
  return callApi("/api/growth/learning/evidence", {
    method: "DELETE",
    body: JSON.stringify({ learningId, path }),
  });
}

export type LearningDraft = {
  courseName: string;
  organizer: string;
  category: Course["category"] | "";
  startDate: string;
  endDate: string;
  venueType: LearningRecord["venueType"] | "";
  venueName: string;
  candidates: Course[];
  note: string;
};

/** AI下書き（設定OFFのときは 404 が返る＝呼び出し側でボタン自体を出さない） */
export async function draftLearningApi(file: Blob): Promise<{ draft: LearningDraft }> {
  const form = new FormData();
  form.set("file", file, "evidence.jpg");
  return callApi("/api/growth/learning/draft", { method: "POST", body: form });
}

// ─── 自分の目標 ───

export async function fetchGoalsApi(userId?: string): Promise<{ goals: Goal[]; tableMissing: boolean }> {
  const q = userId ? `?user=${encodeURIComponent(userId)}` : "";
  return callApi(`/api/growth/goals${q}`);
}

export type GoalInput = Pick<Goal, "title" | "detail" | "status" | "dueDate" | "fromLearningId">;

export async function createGoalApi(input: Partial<GoalInput>): Promise<{ goal: Goal }> {
  return callApi("/api/growth/goals", { method: "POST", body: JSON.stringify(input) });
}

export async function patchGoalApi(id: string, input: Partial<GoalInput>): Promise<{ goal: Goal }> {
  return callApi("/api/growth/goals", { method: "PATCH", body: JSON.stringify({ id, ...input }) });
}

export async function deleteGoalApi(id: string): Promise<void> {
  await callApi("/api/growth/goals?id=" + encodeURIComponent(id), { method: "DELETE" });
}

// ─── 1on1の約束 ───

export type PromiseItem = {
  oneOnOneKey: string;
  ownerId: string;
  heldOn: string;
  partnerName: string;
  mode: string;
  text: string;
  status: PromiseStatusValue | null;
  note: string;
  updatedAt: string;
};

export async function fetchPromisesApi(userId?: string): Promise<{
  promises: PromiseItem[];
  tableMissing: boolean;
}> {
  const q = userId ? `?user=${encodeURIComponent(userId)}` : "";
  return callApi(`/api/growth/promises${q}`);
}

export async function savePromiseStatusApi(input: {
  oneOnOneKey: string;
  ownerId: string;
  status: PromiseStatusValue;
  note: string;
}): Promise<{ status: PromiseStatus }> {
  return callApi("/api/growth/promises", { method: "PUT", body: JSON.stringify(input) });
}

// ─── カルテ（管理者のみ）───

export type KarteListResponse = {
  entries: KarteListEntry[];
  courses: Course[];
  tableMissing: boolean;
  today: string;
};

export async function fetchKarteListApi(): Promise<KarteListResponse> {
  return callApi("/api/growth/karte");
}

export type KarteDetailResponse = KarteDetail & {
  courses: Course[];
  tableMissing: boolean;
  today: string;
};

export async function fetchKarteDetailApi(userId: string): Promise<KarteDetailResponse> {
  return callApi(`/api/growth/karte?user=${encodeURIComponent(userId)}`);
}

export async function searchKarteApi(q: string): Promise<{ hits: SearchHit[] }> {
  return callApi(`/api/growth/karte?q=${encodeURIComponent(q)}`);
}

// ─── 設定・操作ログ（管理者のみ）───

export async function fetchGrowthConfigApi(): Promise<{ config: GrowthConfig }> {
  return callApi("/api/growth/config");
}

export async function saveGrowthConfigApi(aiDraftEnabled: boolean): Promise<{ config: GrowthConfig }> {
  return callApi("/api/growth/config", { method: "PUT", body: JSON.stringify({ aiDraftEnabled }) });
}

export async function fetchGrowthLogsApi(before?: string): Promise<{
  logs: GrowthLog[];
  tableMissing: boolean;
}> {
  const q = before ? `?before=${encodeURIComponent(before)}` : "";
  return callApi(`/api/admin/growth-logs${q}`);
}
