"use client";

// 講座マスタの管理＋学びの記録の設定（指示書179 B-2／B-3）— 管理者のみ到達する
// - 未確認の講座を確認済みにする／既存の講座へ統合する（統合すると再受講回数は数え直される）
// - 名称・主催・区分の修正、記録が無い講座の削除
// - AI下書きのON/OFF（B-3の前提「有料枠・学習に使われない契約」を院長が確認したときだけON）
// - 操作ログ（本文なし・時系列のみ）

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  COURSE_CATEGORIES,
  courseCategoryLabel,
  type Course,
  type CourseCategory,
  type GrowthConfig,
  type GrowthLog,
} from "@/lib/staff-growth";
import {
  createCourseApi,
  deleteCourseApi,
  fetchCoursesApi,
  fetchGrowthConfigApi,
  fetchGrowthLogsApi,
  fetchKarteListApi,
  mergeCourseApi,
  patchCourseApi,
  saveGrowthConfigApi,
} from "@/lib/staff-growth-client";

export function CourseMasterPanel() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [config, setConfig] = useState<GrowthConfig | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [logs, setLogs] = useState<GrowthLog[] | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, cfg] = await Promise.all([fetchCoursesApi(), fetchGrowthConfigApi()]);
      setCourses(c.courses);
      setTableMissing(c.tableMissing);
      setConfig(cfg.config);
      // 講座ごとの「受講した人数」（削除可否・統合の目安）。カルテ一覧から集計する
      try {
        setUsage(await fetchCourseUsage());
      } catch {
        /* 人数は補助情報 */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };

  const unconfirmed = useMemo(() => courses.filter((c) => c.status === "unconfirmed"), [courses]);
  const confirmed = useMemo(() => courses.filter((c) => c.status === "confirmed"), [courses]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      flash(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const confirmCourse = (c: Course) =>
    run(async () => {
      const { course } = await patchCourseApi(c.id, { status: "confirmed" });
      setCourses((prev) => prev.map((x) => (x.id === c.id ? course : x)));
      return `✅ 「${course.name}」を確認済みにしました`;
    });

  const removeCourse = (c: Course) => {
    if (!confirm(`講座「${c.name}」を削除します。よろしいですか？`)) return;
    void run(async () => {
      await deleteCourseApi(c.id);
      setCourses((prev) => prev.filter((x) => x.id !== c.id));
      return `🗑 「${c.name}」を削除しました`;
    });
  };

  const doMerge = () => {
    const from = courses.find((c) => c.id === mergeFrom);
    const into = courses.find((c) => c.id === mergeInto);
    if (!from || !into) return;
    if (
      !confirm(
        `「${from.name}」を「${into.name}」に統合します。\n「${from.name}」に紐づく学びの記録は「${into.name}」に付け替えられ、「${from.name}」は消えます。再受講回数は自動で数え直されます。\n\nよろしいですか？`
      )
    )
      return;
    void run(async () => {
      const { moved } = await mergeCourseApi(from.id, into.id);
      setCourses((prev) => prev.filter((x) => x.id !== from.id));
      setUsage((prev) => {
        const next = new Map(prev);
        next.set(into.id, (next.get(into.id) ?? 0) + (next.get(from.id) ?? 0));
        next.delete(from.id);
        return next;
      });
      setMergeFrom("");
      setMergeInto("");
      return `🔗 統合しました（学びの記録 ${moved}件を付け替え）`;
    });
  };

  const toggleAi = (on: boolean) => {
    if (
      on &&
      !confirm(
        "AI下書きをONにします。\n\nONにできるのは、GEMINI_API_KEY のプロジェクトが「有料枠（Paid）」で、送信内容がモデルの学習に使われない契約であることを Google AI Studio／Google Cloud の課金設定で確認したときだけです。\n\n確認済みですか？"
      )
    )
      return;
    void run(async () => {
      const { config: next } = await saveGrowthConfigApi(on);
      setConfig(next);
      return on ? "🪄 AI下書きをONにしました" : "AI下書きをOFFにしました";
    });
  };

  const loadLogs = async () => {
    try {
      const { logs: l } = await fetchGrowthLogsApi();
      setLogs(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作ログを取得できませんでした");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
        ← スタッフ育成カルテ 一覧
      </Link>
      <header>
        <h1 className="text-lg font-bold text-gray-900">🗂 講座マスタ・設定</h1>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          同じ講座は同じマスタに紐づけます。スタッフが新しく入力した講座は「未確認」に入るので、
          既存の講座と同じなら統合してください（統合すると再受講回数は自動で数え直されます）。
        </p>
      </header>

      {tableMissing && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-gray-800 leading-relaxed">
          テーブルがまだ作られていません。
          <code className="mx-1">~/Downloads/179_スタッフ育成カルテ_テーブル作成.sql</code>
          を Supabase の SQL Editor で実行してください。
        </div>
      )}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
      )}

      {/* AI下書きの設定（B-3） */}
      <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
        <p className="text-sm font-medium text-gray-900">🪄 AI下書き（受講証・メモの画像から）</p>
        <p className="text-[11px] text-gray-700 leading-relaxed">
          前提（指示書179 B-3）: <strong>AIのAPIが有料枠で、送信内容が学習に使われない契約であること</strong>。
          コードからは契約区分を確かめられないため、既定はOFFです。Google AI Studio／Google Cloud の課金設定で
          GEMINI_API_KEY のプロジェクトが有料枠（Paid tier）であることを確認したうえでONにしてください。
          使うモデルは175の基盤（Gemini 3.8 Flash）で、新しいキー・課金は使いません。
        </p>
        {config && (
          <label className="flex items-center gap-2 text-sm text-gray-900 min-h-[44px]">
            <input
              type="checkbox"
              checked={config.aiDraftEnabled}
              disabled={busy}
              onChange={(e) => toggleAi(e.target.checked)}
            />
            AI下書きを有効にする（有料枠・学習に使われない契約を確認済み）
          </label>
        )}
        {config?.aiDraftEnabled && config.aiDraftConfirmedAt && (
          <p className="text-[10px] text-gray-600">
            {config.aiDraftConfirmedAt.slice(0, 10).replaceAll("-", "/")} に {config.aiDraftConfirmedBy} が確認してON
          </p>
        )}
      </section>

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : (
        <>
          {/* 未確認の講座 */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-gray-900">
              ⚠️ 未確認の講座{unconfirmed.length > 0 ? `（${unconfirmed.length}件）` : ""}
            </h2>
            {unconfirmed.length === 0 ? (
              <p className="text-[11px] text-gray-500">未確認の講座はありません。</p>
            ) : (
              <ul className="space-y-2">
                {unconfirmed.map((c) => (
                  <CourseRow
                    key={c.id}
                    course={c}
                    used={usage.get(c.id) ?? 0}
                    busy={busy}
                    editing={editing === c.id}
                    onEdit={() => setEditing(c.id)}
                    onCancel={() => setEditing("")}
                    onSave={(input) =>
                      run(async () => {
                        const { course } = await patchCourseApi(c.id, input);
                        setCourses((prev) => prev.map((x) => (x.id === c.id ? course : x)));
                        setEditing("");
                        return "💾 講座を更新しました";
                      })
                    }
                    onConfirm={() => confirmCourse(c)}
                    onDelete={() => removeCourse(c)}
                    onMerge={() => {
                      setMergeFrom(c.id);
                      setMergeInto("");
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* 統合 */}
          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <h2 className="text-sm font-medium text-gray-900">🔗 講座を統合する</h2>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className={selectClass}>
                <option value="">統合元（消える方）</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "unconfirmed" ? " ※未確認" : ""}
                  </option>
                ))}
              </select>
              <span className="text-center text-gray-500 text-sm">→</span>
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className={selectClass}>
                <option value="">統合先（残る方）</option>
                {courses
                  .filter((c) => c.id !== mergeFrom)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === "unconfirmed" ? " ※未確認" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !mergeFrom || !mergeInto}
              onClick={doMerge}
              className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
            >
              統合する
            </button>
          </section>

          {/* 確認済みの講座 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-gray-900">📚 講座一覧（{confirmed.length}件）</h2>
              {editing === "new" ? null : (
                <button
                  type="button"
                  onClick={() => setEditing("new")}
                  className="px-3 py-2 bg-teal-600 text-white rounded-full text-xs hover:bg-teal-700 min-h-[40px]"
                >
                  ＋ 講座を登録
                </button>
              )}
            </div>
            {editing === "new" && (
              <CourseEditor
                initial={{ name: "", organizer: "", category: "external" }}
                busy={busy}
                onCancel={() => setEditing("")}
                onSave={(input) =>
                  run(async () => {
                    const { course, existed } = await createCourseApi(input);
                    if (!existed) setCourses((prev) => [...prev, course]);
                    setEditing("");
                    return existed
                      ? `同じ講座「${course.name}」がすでにあります`
                      : `💾 「${course.name}」を登録しました`;
                  })
                }
              />
            )}
            {confirmed.length === 0 ? (
              <p className="text-[11px] text-gray-500">まだ講座がありません。</p>
            ) : (
              <ul className="space-y-2">
                {confirmed.map((c) => (
                  <CourseRow
                    key={c.id}
                    course={c}
                    used={usage.get(c.id) ?? 0}
                    busy={busy}
                    editing={editing === c.id}
                    onEdit={() => setEditing(c.id)}
                    onCancel={() => setEditing("")}
                    onSave={(input) =>
                      run(async () => {
                        const { course } = await patchCourseApi(c.id, input);
                        setCourses((prev) => prev.map((x) => (x.id === c.id ? course : x)));
                        setEditing("");
                        return "💾 講座を更新しました";
                      })
                    }
                    onDelete={() => removeCourse(c)}
                    onMerge={() => {
                      setMergeFrom(c.id);
                      setMergeInto("");
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* 操作ログ */}
          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-gray-900">🧾 操作ログ（本文は記録しません）</h2>
              <button
                type="button"
                onClick={() => void loadLogs()}
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 min-h-[40px]"
              >
                {logs ? "再読み込み" : "表示する"}
              </button>
            </div>
            {logs && (
              logs.length === 0 ? (
                <p className="text-[11px] text-gray-500">まだ記録がありません。</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {logs.map((l) => (
                    <li key={l.id} className="border-b border-gray-100 pb-1">
                      <span className="text-gray-500">{l.at.replace("T", " ").slice(0, 16)}</span>{" "}
                      <span className="text-gray-900">
                        {l.by} が {l.kind}を{l.action}
                        {l.target ? `（${l.target}）` : ""}
                      </span>
                      {l.changes.length > 0 && (
                        <span className="block text-gray-600 pl-2">
                          {l.changes.map((c) => `${c.field}: ${c.before || "—"} → ${c.after || "—"}`).join(" / ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** 講座ごとの「受講した人数」（カルテ一覧の courseIds から集計・管理者のみ） */
async function fetchCourseUsage(): Promise<Map<string, number>> {
  const { entries } = await fetchKarteListApi();
  const m = new Map<string, number>();
  for (const e of entries) for (const id of e.courseIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

type CourseEditInput = { name: string; organizer: string; category: CourseCategory };

function CourseRow({
  course,
  used,
  busy,
  editing,
  onEdit,
  onCancel,
  onSave,
  onConfirm,
  onDelete,
  onMerge,
}: {
  course: Course;
  used: number;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: CourseEditInput) => void;
  onConfirm?: () => void;
  onDelete: () => void;
  onMerge: () => void;
}) {
  if (editing) {
    return (
      <li className="rounded-xl border border-gray-200 bg-white p-3">
        <CourseEditor
          initial={{ name: course.name, organizer: course.organizer, category: course.category }}
          busy={busy}
          onCancel={onCancel}
          onSave={onSave}
        />
      </li>
    );
  }
  return (
    <li className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 space-y-1">
      <p className="text-sm text-gray-900">
        {course.name}
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {courseCategoryLabel(course.category)}
        </span>
        {course.status === "unconfirmed" && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            未確認
          </span>
        )}
      </p>
      <p className="text-[11px] text-gray-600">
        {course.organizer ? `主催: ${course.organizer} ・ ` : ""}受講した人 {used}人
        {course.createdBy ? ` ・ 登録: ${course.createdBy}` : ""}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {onConfirm && (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-3 py-2 border border-emerald-300 text-emerald-800 rounded-full text-xs hover:bg-emerald-50 disabled:opacity-40 min-h-[40px]"
          >
            ✅ 確認済みにする
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onMerge}
          className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[40px]"
        >
          🔗 別の講座へ統合
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]"
        >
          ✏️ 編集
        </button>
        <button
          type="button"
          disabled={busy || used > 0}
          onClick={onDelete}
          title={used > 0 ? "学びの記録があるため削除できません（統合を使ってください）" : ""}
          className="px-3 py-2 border border-red-300 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[40px]"
        >
          🗑 削除
        </button>
      </div>
    </li>
  );
}

function CourseEditor({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: CourseEditInput;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: CourseEditInput) => void;
}) {
  const [form, setForm] = useState<CourseEditInput>(initial);
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
      <label className="block">
        <span className="text-[11px] text-gray-700">名称（必須）</span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] text-gray-700">主催</span>
          <input
            value={form.organizer}
            onChange={(e) => setForm((f) => ({ ...f, organizer: e.target.value }))}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-700">区分</span>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CourseCategory }))}
            className={inputClass}
          >
            {COURSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !form.name.trim()}
          onClick={() => onSave({ ...form, name: form.name.trim(), organizer: form.organizer.trim() })}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          💾 保存
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white mt-0.5";
const selectClass =
  "w-full rounded-md border border-gray-200 px-2 py-2 text-[12px] min-h-[44px] bg-white";
