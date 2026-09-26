"use client";

// 講座マスタの管理＋学びの記録の設定（指示書179 B-2／B-3、180 1-1／1-3）— 管理者のみ到達する
// - 講座の追加・編集・**非表示**（削除の口は無い＝過去の記録と再受講回数を壊さない）
// - 項目: 名称・主催・区分・標準の日数。並び替えは148の DragSortList（タッチ対応）
// - 追加依頼（180）と179の「未確認の講座」を同じ一覧に出し、件数バッジ付き。
//   1タップで講座に追加／既存の講座に紐づけ（未確認の講座は統合＝回数は数え直される）
// - AI下書きのON/OFF（B-3の前提を院長が確認したときだけON）
// - 操作ログ（本文なし・時系列のみ）

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DragSortList } from "@/components/admin/DragSortList";
import {
  COURSE_CATEGORIES,
  DEFAULT_DAYS_MAX,
  courseCategoryLabel,
  sortCourses,
  type Course,
  type CourseCategory,
  type CourseRequest,
  type GrowthConfig,
  type GrowthLog,
} from "@/lib/staff-growth";
import {
  createCourseApi,
  fetchCourseRequestsApi,
  fetchCoursesApi,
  fetchGrowthConfigApi,
  fetchGrowthLogsApi,
  fetchKarteListApi,
  mergeCourseApi,
  patchCourseApi,
  resolveCourseRequestApi,
  saveCourseOrderApi,
  saveGrowthConfigApi,
} from "@/lib/staff-growth-client";

type CourseEditInput = {
  name: string;
  organizer: string;
  category: CourseCategory;
  defaultDays: number;
};

export function CourseMasterPanel() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [requests, setRequests] = useState<CourseRequest[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [config, setConfig] = useState<GrowthConfig | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  /** 依頼・未確認講座ごとの「既存に紐づける」先 */
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<GrowthLog[] | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, cfg, rq] = await Promise.all([
        fetchCoursesApi(),
        fetchGrowthConfigApi(),
        fetchCourseRequestsApi().catch(() => ({ requests: [] as CourseRequest[], tableMissing: false })),
      ]);
      setCourses(c.courses);
      setTableMissing(c.tableMissing);
      setConfig(cfg.config);
      setRequests(rq.requests);
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

  const confirmedCourses = useMemo(
    () => sortCourses(courses.filter((c) => c.status === "confirmed")),
    [courses]
  );
  const listCourses = useMemo(
    () => (showHidden ? confirmedCourses : confirmedCourses.filter((c) => !c.hidden)),
    [confirmedCourses, showHidden]
  );
  const hiddenCount = confirmedCourses.filter((c) => c.hidden).length;
  const unconfirmed = useMemo(() => courses.filter((c) => c.status === "unconfirmed"), [courses]);
  const openRequests = useMemo(() => requests.filter((r) => r.status === "open"), [requests]);
  const pendingCount = openRequests.length + unconfirmed.length;

  const replaceCourse = (course: Course) =>
    setCourses((prev) => (prev.some((c) => c.id === course.id) ? prev.map((c) => (c.id === course.id ? course : c)) : [...prev, course]));

  // ─── 講座の操作 ───

  const toggleHidden = (c: Course) =>
    run(async () => {
      const { course } = await patchCourseApi(c.id, { hidden: !c.hidden });
      replaceCourse(course);
      return course.hidden
        ? `🙈 「${course.name}」を非表示にしました（過去の記録と回数はそのまま残ります）`
        : `👁 「${course.name}」を表示に戻しました`;
    });

  const saveEdit = (id: string, input: CourseEditInput) =>
    run(async () => {
      const { course } = await patchCourseApi(id, input);
      replaceCourse(course);
      setEditing("");
      return "💾 講座を更新しました";
    });

  const create = (input: CourseEditInput) =>
    run(async () => {
      const { course, existed } = await createCourseApi(input);
      replaceCourse(course);
      setEditing("");
      return existed ? `同じ講座「${course.name}」がすでにあります` : `💾 「${course.name}」を登録しました`;
    });

  /** 並び替え（148の部品）。落とした時点で保存する */
  const reorder = (from: number, to: number) => {
    const next = listCourses.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // 非表示で隠れている講座は今の相対位置を保つ（表示中の講座の順だけを送る）
    const visibleIds = next.map((c) => c.id);
    const ids = showHidden
      ? visibleIds
      : sortCourses(confirmedCourses)
          .map((c) => c.id)
          .filter((id) => !visibleIds.includes(id))
          .concat(visibleIds);
    setCourses((prev) => prev.map((c) => ({ ...c, order: ids.indexOf(c.id) + 1 || c.order })));
    void run(async () => {
      await saveCourseOrderApi(ids);
      return "↕ 並び順を保存しました";
    });
  };

  // ─── 依頼・未確認講座の処理 ───

  const addFromRequest = (r: CourseRequest) =>
    run(async () => {
      const { request, course } = await resolveCourseRequestApi({ id: r.id, action: "add" });
      setRequests((prev) => prev.map((x) => (x.id === r.id ? request : x)));
      if (course) replaceCourse(course);
      return `✅ 「${r.name}」を講座に追加しました`;
    });

  const linkRequest = (r: CourseRequest) => {
    const courseId = linkTarget[r.id];
    if (!courseId) return;
    void run(async () => {
      const { request, course } = await resolveCourseRequestApi({ id: r.id, action: "link", courseId });
      setRequests((prev) => prev.map((x) => (x.id === r.id ? request : x)));
      return `↪ 「${r.name}」を既存の講座「${course?.name ?? ""}」に紐づけました`;
    });
  };

  const confirmUnconfirmed = (c: Course) =>
    run(async () => {
      const { course } = await patchCourseApi(c.id, { status: "confirmed", hidden: false });
      replaceCourse(course);
      return `✅ 「${course.name}」を講座に追加しました`;
    });

  const mergeUnconfirmed = (c: Course) => {
    const intoId = linkTarget[c.id];
    const into = courses.find((x) => x.id === intoId);
    if (!into) return;
    if (
      !confirm(
        `「${c.name}」を「${into.name}」に統合します。紐づく学びの記録は「${into.name}」に付け替えられ、再受講回数は数え直されます。\n\nよろしいですか？`
      )
    )
      return;
    void run(async () => {
      const { moved } = await mergeCourseApi(c.id, into.id);
      setCourses((prev) => prev.filter((x) => x.id !== c.id));
      setUsage((prev) => {
        const next = new Map(prev);
        next.set(into.id, (next.get(into.id) ?? 0) + (next.get(c.id) ?? 0));
        next.delete(c.id);
        return next;
      });
      return `🔗 統合しました（学びの記録 ${moved}件を付け替え）`;
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

  const targetOptions = (excludeId: string) =>
    confirmedCourses.filter((c) => c.id !== excludeId);

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
        ← スタッフ育成カルテ 一覧
      </Link>
      <header>
        <h1 className="text-lg font-bold text-gray-900">🗂 講座マスタ・設定</h1>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          講座（セミナー・勉強会・学会）は管理者が登録し、スタッフは一覧から選ぶだけです。
          一覧に無い講座はスタッフから「追加依頼」が届きます。過去の記録で使われている講座は削除せず「非表示」にします。
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

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : (
        <>
          {/* 追加依頼＋未確認の講座（180 1-2／1-3） */}
          <section className="space-y-2" data-section="requests">
            <h2 className="text-sm font-medium text-gray-900">
              📨 追加依頼・未確認の講座
              <span
                className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${
                  pendingCount > 0 ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-600"
                }`}
                aria-label={`未処理 ${pendingCount}件`}
              >
                {pendingCount}件
              </span>
            </h2>
            {pendingCount === 0 ? (
              <p className="text-[11px] text-gray-500">未処理の依頼はありません。</p>
            ) : (
              <ul className="space-y-2">
                {openRequests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 space-y-2">
                    <p className="text-sm text-gray-900">
                      {r.name}
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">依頼</span>
                    </p>
                    <p className="text-[11px] text-gray-600">
                      依頼: {r.userName || "スタッフ"}
                      {r.createdAt ? ` ・ ${r.createdAt.slice(0, 10).replaceAll("-", "/")}` : ""}
                    </p>
                    <PendingActions
                      id={r.id}
                      busy={busy}
                      options={targetOptions("")}
                      target={linkTarget[r.id] ?? ""}
                      onTarget={(v) => setLinkTarget((prev) => ({ ...prev, [r.id]: v }))}
                      addLabel="✅ 講座に追加"
                      linkLabel="↪ 既存の講座に紐づけて却下"
                      onAdd={() => addFromRequest(r)}
                      onLink={() => linkRequest(r)}
                    />
                  </li>
                ))}
                {unconfirmed.map((c) => (
                  <li key={c.id} className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 space-y-2">
                    <p className="text-sm text-gray-900">
                      {c.name}
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        未確認（179で入力）
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-600">
                      登録: {c.createdBy || "スタッフ"} ・ 学びの記録 {usage.get(c.id) ?? 0}人
                    </p>
                    <PendingActions
                      id={c.id}
                      busy={busy}
                      options={targetOptions(c.id)}
                      target={linkTarget[c.id] ?? ""}
                      onTarget={(v) => setLinkTarget((prev) => ({ ...prev, [c.id]: v }))}
                      addLabel="✅ このまま講座に追加"
                      linkLabel="🔗 既存の講座に統合（回数は数え直し）"
                      onAdd={() => confirmUnconfirmed(c)}
                      onLink={() => mergeUnconfirmed(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 講座一覧（並び替え・編集・非表示） */}
          <section className="space-y-2" data-section="courses">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-gray-900">
                📚 講座一覧（{listCourses.length}件{hiddenCount > 0 && !showHidden ? `・非表示 ${hiddenCount}件` : ""}）
              </h2>
              <div className="flex items-center gap-2">
                {hiddenCount > 0 && (
                  <label className="flex items-center gap-1 text-[11px] text-gray-700 min-h-[36px]">
                    <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
                    非表示も見る
                  </label>
                )}
                {editing !== "new" && (
                  <button
                    type="button"
                    onClick={() => setEditing("new")}
                    className="px-3 py-2 bg-teal-600 text-white rounded-full text-xs hover:bg-teal-700 min-h-[40px]"
                  >
                    ＋ 講座を登録
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-500">⠿ をつかんで並び替えられます（スタッフの一覧もこの順になります）。</p>
            {editing === "new" && (
              <CourseEditor
                initial={{ name: "", organizer: "", category: "external", defaultDays: 0 }}
                busy={busy}
                onCancel={() => setEditing("")}
                onSave={create}
              />
            )}
            {listCourses.length === 0 ? (
              <p className="text-[11px] text-gray-500">まだ講座がありません。</p>
            ) : (
              <DragSortList
                items={listCourses}
                keyOf={(c) => c.id}
                onReorder={reorder}
                className="space-y-2"
                renderRow={({ item: c, dragging, handleProps }) =>
                  editing === c.id ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <CourseEditor
                        initial={{ name: c.name, organizer: c.organizer, category: c.category, defaultDays: c.defaultDays }}
                        busy={busy}
                        onCancel={() => setEditing("")}
                        onSave={(input) => saveEdit(c.id, input)}
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex gap-2 rounded-xl border px-2 py-2.5 ${
                        dragging ? "border-teal-400 bg-teal-50 shadow-sm" : c.hidden ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                      }`}
                    >
                      <span
                        {...handleProps}
                        className="shrink-0 w-8 min-h-[44px] flex items-center justify-center text-gray-400 cursor-grab select-none"
                      >
                        ⠿
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className={`text-sm ${c.hidden ? "text-gray-500" : "text-gray-900"}`}>
                          {c.name}
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {courseCategoryLabel(c.category)}
                          </span>
                          {c.defaultDays > 0 && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800">
                              標準 {c.defaultDays}日間
                            </span>
                          )}
                          {c.hidden && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-600">
                              非表示
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-600">
                          {c.organizer ? `主催: ${c.organizer} ・ ` : ""}受講した人 {usage.get(c.id) ?? 0}人
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditing(c.id)}
                            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]"
                          >
                            ✏️ 編集
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleHidden(c)}
                            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]"
                          >
                            {c.hidden ? "👁 表示に戻す" : "🙈 非表示にする"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMergeFrom(c.id);
                              setMergeInto("");
                            }}
                            className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[40px]"
                          >
                            🔗 別の講座へ統合
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }
              />
            )}
          </section>

          {/* 統合 */}
          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <h2 className="text-sm font-medium text-gray-900">🔗 講座を統合する</h2>
            <p className="text-[10px] text-gray-500">重複した講座を1つにまとめます。統合元の記録は統合先に付け替えられ、再受講回数は数え直されます。</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className={selectClass} aria-label="統合元">
                <option value="">統合元（消える方）</option>
                {sortCourses(courses).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "unconfirmed" ? " ※未確認" : c.hidden ? " ※非表示" : ""}
                  </option>
                ))}
              </select>
              <span className="text-center text-gray-500 text-sm">→</span>
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className={selectClass} aria-label="統合先">
                <option value="">統合先（残る方）</option>
                {sortCourses(courses)
                  .filter((c) => c.id !== mergeFrom)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === "unconfirmed" ? " ※未確認" : c.hidden ? " ※非表示" : ""}
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
                  aria-label="AI下書きを有効にする"
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
            {logs &&
              (logs.length === 0 ? (
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
              ))}
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

function PendingActions({
  id,
  busy,
  options,
  target,
  onTarget,
  addLabel,
  linkLabel,
  onAdd,
  onLink,
}: {
  id: string;
  busy: boolean;
  options: Course[];
  target: string;
  onTarget: (v: string) => void;
  addLabel: string;
  linkLabel: string;
  onAdd: () => void;
  onLink: () => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={onAdd}
        className="px-3 py-2 bg-teal-600 text-white rounded-full text-xs hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
      >
        {addLabel}
      </button>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          className={selectClass + " sm:max-w-[16em]"}
          aria-label={`${id} の紐づけ先`}
        >
          <option value="">既存の講座を選ぶ…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.hidden ? " ※非表示" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !target}
          onClick={onLink}
          className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[44px]"
        >
          {linkLabel}
        </button>
      </div>
    </div>
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
          aria-label="講座の名称"
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
        <label className="block">
          <span className="text-[11px] text-gray-700">標準の日数（任意）</span>
          <input
            type="number"
            min={0}
            max={DEFAULT_DAYS_MAX}
            inputMode="numeric"
            value={form.defaultDays || ""}
            onChange={(e) => setForm((f) => ({ ...f, defaultDays: Math.max(0, Math.min(DEFAULT_DAYS_MAX, Number(e.target.value) || 0)) }))}
            className={inputClass}
            placeholder="例: 3"
            aria-label="標準の日数"
          />
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
