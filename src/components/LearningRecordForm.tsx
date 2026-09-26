"use client";

// 学びの記録の入力フォーム（指示書179 B／180）。本人ページ（C）と管理者のカルテ（A）で共用。
//
// - 講座は**一覧から選ぶだけ**（180 1-2）。自由入力で新しい講座は作れない。区分ごとに分け、名称で検索できる。
//   一覧に無ければ「追加を依頼」（名称だけ）。依頼の段階では記録を作らない
// - 参加日は**複数日**（180 2）。「期間で追加」（開始〜終了をまとめて）と「日付を追加」（1日ずつ）。
//   追加した日付はチップで並び、個別に外せる。標準の日数がある講座は開始日から終了日の候補を出す。
//   iPhoneで扱いやすいよう標準の <input type="date"> だけを使う（独自カレンダーは作らない）
// - AI下書き（B-3）は設定ONのときだけボタンが出る。**保存は本人が確認して押したときだけ**
// - 下書き保持（176-補の仕組みをそのまま使う）: 保存前の入力は sessionStorage に残る

import { useMemo, useRef, useState } from "react";
import {
  COURSE_CATEGORIES,
  DATES_MAX,
  VENUE_TYPES,
  addDaysYmd,
  expandDateRange,
  findSameCourse,
  formatDates,
  normalizeCourseName,
  normalizeDates,
  parseTagsInput,
  selectableCourses,
  ymd,
  type Course,
  type CourseRequest,
  type LearningRecord,
  type VenueType,
} from "@/lib/staff-growth";
import {
  createCourseRequestApi,
  draftLearningApi,
  type LearningInput,
} from "@/lib/staff-growth-client";
import { useDraft, DISCARD_CONFIRM } from "@/lib/retro-drafts";
import { PHOTO_MAX_EDGE, resizeImageToJpeg } from "@/lib/image-resize";

export type LearningFormValues = {
  courseId: string;
  /** 参加日の一覧（昇順） */
  dates: string[];
  rangeStart: string;
  rangeEnd: string;
  singleDate: string;
  venueType: VenueType;
  venueName: string;
  learned: string;
  nextAction: string;
  tagsText: string;
};

export function emptyLearningForm(): LearningFormValues {
  return {
    courseId: "",
    dates: [],
    rangeStart: "",
    rangeEnd: "",
    singleDate: "",
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
    dates: r.dates,
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
  myRequests,
  aiDraftEnabled,
  busy,
  isEdit,
  onCancel,
  onRequestCreated,
  onSubmit,
}: {
  draftKey: string;
  initial: LearningFormValues;
  courses: Course[];
  /** 自分が出した追加依頼（状況の表示用） */
  myRequests: CourseRequest[];
  aiDraftEnabled: boolean;
  busy: boolean;
  isEdit: boolean;
  onCancel: () => void;
  onRequestCreated: (req: CourseRequest) => void;
  /** 保存。evidence は AI下書きに使った画像（保存後に証跡として添付する・任意） */
  onSubmit: (input: LearningInput, evidence: Blob | null) => Promise<string | null>;
}) {
  const { values, set, setValues, dirty, discard } = useDraft<LearningFormValues>(draftKey, initial);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestMsg, setRequestMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [candidates, setCandidates] = useState<Course[]>([]);
  const [evidence, setEvidence] = useState<Blob | null>(null);
  const [attachEvidence, setAttachEvidence] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // 選べる講座（確認済み・表示中。編集中の記録の講座は非表示でも残す）→ 検索 → 区分ごと
  const selectable = useMemo(() => selectableCourses(courses, initial.courseId), [courses, initial.courseId]);
  const filtered = useMemo(() => {
    const q = normalizeCourseName(search);
    return q ? selectable.filter((c) => normalizeCourseName(`${c.name}${c.organizer}`).includes(q)) : selectable;
  }, [selectable, search]);
  const groups = useMemo(
    () =>
      COURSE_CATEGORIES.map((cat) => ({
        ...cat,
        courses: filtered.filter((c) => c.category === cat.value),
      })).filter((g) => g.courses.length > 0),
    [filtered]
  );
  const selected = useMemo(() => courses.find((c) => c.id === values.courseId) ?? null, [courses, values.courseId]);
  const openRequests = myRequests.filter((r) => r.status === "open");
  const resolvedRequests = myRequests.filter((r) => r.status !== "open");

  // ─── 参加日 ───
  const setDates = (next: string[]) => set("dates", normalizeDates(next));
  const addRange = () => {
    const s = ymd(values.rangeStart);
    if (!s) {
      setError("期間の開始日を選んでください");
      return;
    }
    const days = expandDateRange(s, ymd(values.rangeEnd) || s);
    if (values.dates.length + days.length > DATES_MAX) {
      setError(`参加日は${DATES_MAX}日までです`);
      return;
    }
    setError("");
    setValues((prev) => ({
      ...prev,
      dates: normalizeDates([...prev.dates, ...days]),
      rangeStart: "",
      rangeEnd: "",
    }));
  };
  const addSingle = () => {
    const d = ymd(values.singleDate);
    if (!d) {
      setError("日付を選んでください");
      return;
    }
    setError("");
    setValues((prev) => ({ ...prev, dates: normalizeDates([...prev.dates, d]), singleDate: "" }));
  };
  const removeDate = (d: string) => setDates(values.dates.filter((x) => x !== d));
  /** 開始日を選んだとき、講座に標準の日数があれば終了日の候補を入れる（既に入力済みなら触らない） */
  const onRangeStart = (v: string) => {
    setValues((prev) => {
      const days = selected?.defaultDays ?? 0;
      const end = days > 1 && ymd(v) && !prev.rangeEnd ? addDaysYmd(v, days - 1) : prev.rangeEnd;
      return { ...prev, rangeStart: v, rangeEnd: end };
    });
  };

  // ─── 追加依頼 ───
  const sendRequest = async () => {
    const name = requestName.trim();
    if (!name) return;
    setRequesting(true);
    setRequestMsg("");
    try {
      const j = await createCourseRequestApi(name);
      if (j.existing) {
        set("courseId", j.existing.id);
        setRequestMsg(`「${j.existing.name}」は既に一覧にあります。選びました。`);
      } else if (j.request) {
        onRequestCreated(j.request);
        setRequestMsg("依頼しました。管理者が追加すると一覧から選べるようになります（依頼だけでは記録は作られません）。");
      }
      setRequestName("");
    } catch (e) {
      setRequestMsg(e instanceof Error ? e.message : "依頼に失敗しました");
    } finally {
      setRequesting(false);
    }
  };

  // ─── AI下書き ───
  const runAiDraft = async (file: File) => {
    setAiBusy(true);
    setAiNote("");
    setError("");
    try {
      const blob = await resizeImageToJpeg(file, PHOTO_MAX_EDGE);
      const { draft } = await draftLearningApi(blob);
      setEvidence(blob);
      const exact = draft.candidates.find((c) => findSameCourse([c], draft.courseName) !== null) ?? null;
      const usable = exact && selectable.some((c) => c.id === exact.id) ? exact : null;
      setValues((prev) => ({
        ...prev,
        courseId: usable ? usable.id : prev.courseId,
        dates: draft.dates.length > 0 ? normalizeDates(draft.dates) : prev.dates,
        venueType: draft.venueType || prev.venueType,
        venueName: draft.venueName || prev.venueName,
      }));
      setCandidates(usable ? [] : draft.candidates.filter((c) => selectable.some((s) => s.id === c.id)));
      if (!usable && draft.courseName) setRequestName(draft.courseName);
      setAiNote(
        draft.note ||
          (usable
            ? `講座「${usable.name}」に一致しました。参加日と内容を確認して保存してください。`
            : draft.courseName
              ? `読み取った講座名「${draft.courseName}」は一覧にありません。候補から選ぶか、追加を依頼してください。`
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
    if (!values.courseId) {
      setError("講座を一覧から選んでください");
      return;
    }
    if (values.dates.length === 0) {
      setError("参加日を1日以上追加してください");
      return;
    }
    const input: LearningInput = {
      courseId: values.courseId,
      dates: values.dates,
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
          <p className="text-[11px] font-medium text-violet-900">🪄 受講証・メモの画像から下書きを作る（AI）</p>
          <p className="text-[10px] text-violet-800 leading-relaxed">
            講座・参加日・場所を読み取って埋めます。読み取った内容は必ず確認してから保存してください（AIは保存しません）。
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
              <input type="checkbox" checked={attachEvidence} onChange={(e) => setAttachEvidence(e.target.checked)} />
              この画像を証跡として保存時に添付する
            </label>
          )}
        </div>
      )}

      {/* 講座（一覧から選ぶ） */}
      <div className="space-y-1.5">
        <Field label="講座（必須・一覧から選ぶ）">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名称で検索"
            className={inputClass}
            aria-label="講座を検索"
          />
        </Field>
        <select
          value={values.courseId}
          onChange={(e) => set("courseId", e.target.value)}
          className={inputClass}
          aria-label="講座"
          size={Math.min(8, Math.max(3, filtered.length + groups.length + 1))}
        >
          <option value="">— 選んでください —</option>
          {groups.map((g) => (
            <optgroup key={g.value} label={g.label}>
              {g.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.organizer ? `（${c.organizer}）` : ""}
                  {c.defaultDays ? ` ・${c.defaultDays}日間` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selected && (
          <p className="text-[11px] text-teal-900">
            選択中: <strong>{selected.name}</strong>
            {selected.organizer ? `（${selected.organizer}）` : ""}
            {selected.defaultDays ? ` ・ 標準 ${selected.defaultDays}日間` : ""}
            {selected.hidden ? " ・ 非表示の講座" : ""}
          </p>
        )}
        {filtered.length === 0 && (
          <p className="text-[11px] text-gray-600">該当する講座がありません。</p>
        )}

        {candidates.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1">
            <p className="text-[11px] text-gray-700">似た講座（同じ講座なら選んでください）</p>
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

        {/* 一覧に無いとき: 追加を依頼（名称だけ） */}
        <details className="rounded-lg border border-gray-200 bg-white p-2">
          <summary className="text-[11px] text-gray-700 cursor-pointer min-h-[32px] flex items-center">
            一覧に無い講座は「追加を依頼」
            {openRequests.length > 0 ? `（依頼中 ${openRequests.length}件）` : ""}
          </summary>
          <div className="mt-1 space-y-1.5">
            <p className="text-[10px] text-gray-600 leading-relaxed">
              名称だけ送ります。管理者が講座に追加すると一覧から選べるようになります。依頼だけでは学びの記録は作られません。
            </p>
            <div className="flex gap-2">
              <input
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                placeholder="講座の名称"
                className={inputClass}
                aria-label="依頼する講座の名称"
              />
              <button
                type="button"
                onClick={() => void sendRequest()}
                disabled={requesting || busy || !requestName.trim()}
                className="shrink-0 px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[44px]"
              >
                {requesting ? "送信中…" : "追加を依頼"}
              </button>
            </div>
            {requestMsg && <p className="text-[11px] text-teal-900">{requestMsg}</p>}
            {openRequests.length > 0 && (
              <ul className="text-[11px] text-gray-700">
                {openRequests.map((r) => (
                  <li key={r.id}>⏳ 依頼中: {r.name}</li>
                ))}
              </ul>
            )}
            {resolvedRequests.length > 0 && (
              <ul className="text-[11px] text-gray-700">
                {resolvedRequests.slice(-3).map((r) => {
                  const c = courses.find((x) => x.id === r.courseId);
                  return (
                    <li key={r.id}>
                      {r.status === "added" ? "✅ 追加済み" : "↪ 既存の講座で"}: {r.name}
                      {c && c.id !== r.name ? ` → 「${c.name}」` : ""}
                      {c && (
                        <button
                          type="button"
                          onClick={() => set("courseId", c.id)}
                          className="ml-1 underline underline-offset-2 text-teal-800"
                        >
                          選ぶ
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </details>
      </div>

      {/* 参加日（複数日） */}
      <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
        <p className="text-[11px] font-medium text-gray-800">参加日（必須・複数日可）</p>
        {values.dates.length > 0 ? (
          <>
            <p className="text-[12px] text-gray-900">{formatDates(values.dates)}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="参加日の一覧">
              {values.dates.map((d) => (
                <li key={d}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 text-teal-900 text-[12px] pl-2.5 pr-1 py-1">
                    {d.replaceAll("-", "/")}
                    <button
                      type="button"
                      onClick={() => removeDate(d)}
                      aria-label={`${d.replaceAll("-", "/")} を外す`}
                      className="h-7 w-7 rounded-full hover:bg-teal-100 text-[13px]"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[11px] text-gray-600">まだ参加日がありません。下のどちらかで追加してください。</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-md border border-gray-200 p-2 space-y-1.5">
            <p className="text-[11px] text-gray-700">📅 期間で追加（連続した日程）</p>
            <input
              type="date"
              value={values.rangeStart}
              onChange={(e) => onRangeStart(e.target.value)}
              className={inputClass}
              aria-label="期間の開始日"
            />
            <input
              type="date"
              value={values.rangeEnd}
              min={values.rangeStart || undefined}
              onChange={(e) => set("rangeEnd", e.target.value)}
              className={inputClass}
              aria-label="期間の終了日"
            />
            {selected?.defaultDays ? (
              <p className="text-[10px] text-gray-500">開始日を選ぶと、標準の{selected.defaultDays}日間で終了日の候補が入ります。</p>
            ) : null}
            <button
              type="button"
              onClick={addRange}
              disabled={busy || !values.rangeStart}
              className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[44px]"
            >
              期間で追加
            </button>
          </div>
          <div className="rounded-md border border-gray-200 p-2 space-y-1.5">
            <p className="text-[11px] text-gray-700">📆 日付を追加（1日ずつ・飛び飛び）</p>
            <input
              type="date"
              value={values.singleDate}
              onChange={(e) => set("singleDate", e.target.value)}
              className={inputClass}
              aria-label="追加する日付"
            />
            <button
              type="button"
              onClick={addSingle}
              disabled={busy || !values.singleDate}
              className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[44px]"
            >
              日付を追加
            </button>
          </div>
        </div>
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
