"use client";

// 学びの記録の入力フォーム（指示書179 B）。本人ページ（C）と管理者のカルテ（A）で共用。
//
// - 講座は**マスタから選ぶ**（表記ゆれを入力の段階で防ぐ・B-2）。無ければ「新しい講座」を
//   ここで登録する（スタッフが登録すると「未確認」になり、管理者が既存の講座に統合できる）
// - AI下書き（B-3）は設定ONのときだけボタンが出る。画像を読ませて講座名・日付・場所を埋め、
//   講座マスタの候補を示す。**保存は本人が確認して押したときだけ**（AIは直接保存しない）
// - 下書き保持（176-補の仕組みをそのまま使う）: 保存前の入力は sessionStorage に残る

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COURSE_CATEGORIES,
  VENUE_TYPES,
  findSameCourse,
  parseTagsInput,
  suggestCourses,
  type Course,
  type CourseCategory,
  type LearningRecord,
  type VenueType,
} from "@/lib/staff-growth";
import {
  createCourseApi,
  draftLearningApi,
  type LearningInput,
} from "@/lib/staff-growth-client";
import { useDraft, DISCARD_CONFIRM } from "@/lib/retro-drafts";
import { PHOTO_MAX_EDGE, resizeImageToJpeg } from "@/lib/image-resize";

const NEW_COURSE = "__new__";

export type LearningFormValues = {
  courseId: string;
  newCourseName: string;
  newCourseOrganizer: string;
  newCourseCategory: CourseCategory;
  startDate: string;
  endDate: string;
  venueType: VenueType;
  venueName: string;
  learned: string;
  nextAction: string;
  tagsText: string;
};

export function emptyLearningForm(): LearningFormValues {
  return {
    courseId: "",
    newCourseName: "",
    newCourseOrganizer: "",
    newCourseCategory: "external",
    startDate: "",
    endDate: "",
    venueType: "venue",
    venueName: "",
    learned: "",
    nextAction: "",
    tagsText: "",
  };
}

export function learningFormFrom(r: LearningRecord): LearningFormValues {
  return {
    ...emptyLearningForm(),
    courseId: r.courseId,
    startDate: r.startDate,
    endDate: r.endDate,
    venueType: r.venueType,
    venueName: r.venueName,
    learned: r.learned,
    nextAction: r.nextAction,
    tagsText: r.tags.join(", "),
  };
}

export function LearningRecordForm({
  draftKey,
  initial,
  courses,
  aiDraftEnabled,
  busy,
  isEdit,
  onCancel,
  onCourseCreated,
  onSubmit,
}: {
  draftKey: string;
  initial: LearningFormValues;
  courses: Course[];
  aiDraftEnabled: boolean;
  busy: boolean;
  isEdit: boolean;
  onCancel: () => void;
  /** 新しい講座を登録したとき（親の候補一覧を更新する） */
  onCourseCreated: (course: Course) => void;
  /** 保存。evidence は AI下書きに使った画像（保存後に証跡として添付する・任意） */
  onSubmit: (input: LearningInput, evidence: Blob | null) => Promise<string | null>;
}) {
  const { values, set, setValues, dirty, discard } = useDraft<LearningFormValues>(draftKey, initial);
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [candidates, setCandidates] = useState<Course[]>([]);
  const [evidence, setEvidence] = useState<Blob | null>(null);
  const [attachEvidence, setAttachEvidence] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const sortedCourses = useMemo(
    () =>
      courses
        .slice()
        .sort(
          (a, b) =>
            (a.status === "unconfirmed" ? 1 : 0) - (b.status === "unconfirmed" ? 1 : 0) ||
            a.name.localeCompare(b.name, "ja")
        ),
    [courses]
  );

  // 新しい講座名を打っているとき、同名の既存講座があれば案内する（表記ゆれ防止）
  const sameCourse = useMemo(
    () => (values.courseId === NEW_COURSE ? findSameCourse(courses, values.newCourseName) : null),
    [courses, values.courseId, values.newCourseName]
  );
  const similar = useMemo(
    () =>
      values.courseId === NEW_COURSE && !sameCourse
        ? suggestCourses(courses, values.newCourseName, 5)
        : [],
    [courses, values.courseId, values.newCourseName, sameCourse]
  );

  useEffect(() => {
    if (values.courseId !== NEW_COURSE) setCandidates([]);
  }, [values.courseId]);

  const runAiDraft = async (file: File) => {
    setAiBusy(true);
    setAiNote("");
    setError("");
    try {
      const blob = await resizeImageToJpeg(file, PHOTO_MAX_EDGE);
      const { draft } = await draftLearningApi(blob);
      setEvidence(blob);
      const exact = draft.candidates.find(
        (c) => findSameCourse([c], draft.courseName) !== null
      );
      setValues((prev) => ({
        ...prev,
        courseId: exact ? exact.id : draft.courseName ? NEW_COURSE : prev.courseId,
        newCourseName: exact ? prev.newCourseName : draft.courseName || prev.newCourseName,
        newCourseOrganizer: draft.organizer || prev.newCourseOrganizer,
        newCourseCategory: draft.category || prev.newCourseCategory,
        startDate: draft.startDate || prev.startDate,
        endDate: draft.endDate || draft.startDate || prev.endDate,
        venueType: draft.venueType || prev.venueType,
        venueName: draft.venueName || prev.venueName,
      }));
      setCandidates(exact ? [] : draft.candidates);
      setAiNote(
        draft.note ||
          (exact
            ? `講座マスタの「${exact.name}」に一致しました。内容を確認して保存してください。`
            : draft.candidates.length > 0
              ? "似た講座があります。同じ講座なら候補から選んでください。"
              : "読み取った内容を確認して保存してください。")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI下書きに失敗しました");
    } finally {
      setAiBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    setError("");
    if (!values.startDate) {
      setError("開催日（開始）を入力してください");
      return;
    }
    let courseId = values.courseId;
    if (courseId === NEW_COURSE) {
      const name = values.newCourseName.trim();
      if (!name) {
        setError("講座の名称を入力してください");
        return;
      }
      try {
        const { course } = await createCourseApi({
          name,
          organizer: values.newCourseOrganizer.trim(),
          category: values.newCourseCategory,
        });
        onCourseCreated(course);
        courseId = course.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "講座の登録に失敗しました");
        return;
      }
    }
    if (!courseId) {
      setError("講座を選んでください");
      return;
    }
    const input: LearningInput = {
      courseId,
      startDate: values.startDate,
      endDate: values.endDate || values.startDate,
      venueType: values.venueType,
      venueName: values.venueName.trim(),
      learned: values.learned,
      nextAction: values.nextAction,
      tags: parseTagsInput(values.tagsText),
    };
    const err = await onSubmit(input, attachEvidence ? evidence : null);
    if (err) {
      setError(err);
      return;
    }
    discard();
  };

  const cancel = () => {
    if (dirty && !confirm(DISCARD_CONFIRM)) return;
    discard();
    onCancel();
  };

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">
          {isEdit ? "✏️ 学びの記録を編集" : "＋ 学びの記録を追加"}
        </p>
        {dirty && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            下書きあり
          </span>
        )}
      </div>

      {aiDraftEnabled && !isEdit && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2 space-y-1">
          <p className="text-[11px] font-medium text-violet-900">
            🪄 受講証・メモの画像から下書きを作る（AI）
          </p>
          <p className="text-[10px] text-violet-800 leading-relaxed">
            講座名・日付・場所を読み取って埋めます。読み取った内容は必ず確認してから保存してください
            （AIは保存しません）。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={aiBusy || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runAiDraft(f);
            }}
            className="text-xs"
          />
          {aiBusy && <p className="text-[11px] text-violet-800">読み取り中…</p>}
          {aiNote && <p className="text-[11px] text-violet-900">{aiNote}</p>}
          {evidence && (
            <label className="flex items-center gap-2 text-[11px] text-violet-900 min-h-[32px]">
              <input
                type="checkbox"
                checked={attachEvidence}
                onChange={(e) => setAttachEvidence(e.target.checked)}
              />
              この画像を証跡として保存時に添付する
            </label>
          )}
        </div>
      )}

      <Field label="講座（必須）">
        <select
          value={values.courseId}
          onChange={(e) => set("courseId", e.target.value)}
          className={inputClass}
        >
          <option value="">選んでください</option>
          {sortedCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.organizer ? `（${c.organizer}）` : ""}
              {c.status === "unconfirmed" ? " ※未確認" : ""}
            </option>
          ))}
          <option value={NEW_COURSE}>＋ 新しい講座を入力する</option>
        </select>
      </Field>

      {candidates.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1">
          <p className="text-[11px] text-gray-700">講座マスタの候補（同じ講座なら選んでください）</p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  set("courseId", c.id);
                  setCandidates([]);
                }}
                className="px-2.5 py-1.5 rounded-full border border-teal-300 text-teal-800 text-[11px] hover:bg-teal-50 min-h-[36px]"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {values.courseId === NEW_COURSE && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
          <p className="text-[11px] text-gray-700 leading-relaxed">
            新しい講座は「未確認の講座」として登録されます。同じ講座が既にある場合は、管理者があとから1つにまとめます。
          </p>
          <Field label="講座の名称">
            <input
              value={values.newCourseName}
              onChange={(e) => set("newCourseName", e.target.value)}
              className={inputClass}
              placeholder="例: 日本皮膚科学会総会"
            />
          </Field>
          {sameCourse && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
              同じ名称の講座「{sameCourse.name}」があります。
              <button
                type="button"
                onClick={() => set("courseId", sameCourse.id)}
                className="ml-1 underline underline-offset-2"
              >
                この講座を選ぶ
              </button>
            </p>
          )}
          {similar.length > 0 && (
            <div className="text-[11px] text-gray-700">
              似た講座:
              {similar.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set("courseId", c.id)}
                  className="ml-1.5 underline underline-offset-2 text-teal-800"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="主催">
              <input
                value={values.newCourseOrganizer}
                onChange={(e) => set("newCourseOrganizer", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="区分">
              <select
                value={values.newCourseCategory}
                onChange={(e) => set("newCourseCategory", e.target.value as CourseCategory)}
                className={inputClass}
              >
                {COURSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="開催日（開始・必須）">
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="開催日（終了）">
          <input
            type="date"
            value={values.endDate}
            min={values.startDate || undefined}
            onChange={(e) => set("endDate", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[9em_1fr] gap-2">
        <Field label="場所">
          <select
            value={values.venueType}
            onChange={(e) => set("venueType", e.target.value as VenueType)}
            className={inputClass}
          >
            {VENUE_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={values.venueType === "online" ? "サービス名など" : "会場名"}>
          <input
            value={values.venueName}
            onChange={(e) => set("venueName", e.target.value)}
            className={inputClass}
            placeholder={values.venueType === "inhouse" ? "院内（空でも可）" : ""}
          />
        </Field>
      </div>

      <Field label="学んだこと">
        <textarea
          value={values.learned}
          onChange={(e) => set("learned", e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        />
      </Field>

      <Field label="次にやること（あとで「自分の目標」に移せます）">
        <textarea
          value={values.nextAction}
          onChange={(e) => set("nextAction", e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        />
      </Field>

      <Field label="タグ（読点・空白で区切る／最大10個）">
        <input
          value={values.tagsText}
          onChange={(e) => set("tagsText", e.target.value)}
          className={inputClass}
          placeholder="例: 接遇, レーザー, 感染対策"
        />
      </Field>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || aiBusy}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          {busy ? "保存中…" : "💾 保存"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-700">{label}</span>
      <span className="block mt-0.5">{children}</span>
    </label>
  );
}
