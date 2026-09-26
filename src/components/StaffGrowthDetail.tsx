"use client";

// スタッフ育成カルテ 個人のカルテ（指示書179 A-4）— 管理者のみ到達する
// - 上部カード: 最新の1on1の約束／最近の学び／次回1on1の予定（この便では予定データが無い）
// - 成長年表: 入職→1on1→学び→メンバーノート→自己評価→公開サーベイ→権限委譲を時系列に
// - 各項目から元の画面へ移動できる
// - 学びの記録は管理者がここから追加・編集できる（B-4）
// 家族構成はここに出さない（APIも返さない）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TIMELINE_KIND_LABEL,
  formatDates,
  formatDiff,
  promiseStatusLabel,
  tenureLabel,
  type Course,
  type LearningRecord,
  type SurveyView,
  type TimelineKind,
} from "@/lib/staff-growth";
import { NEED_KEYS, NEED_LABELS, NEED_GROUP_STYLE, NEEDS_GROUPS } from "@/lib/needs-survey";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";
import {
  createLearningApi,
  deleteEvidenceApi,
  deleteLearningApi,
  fetchKarteDetailApi,
  fetchLearningApi,
  patchLearningApi,
  uploadEvidenceApi,
  type KarteDetailResponse,
  type LearningInput,
} from "@/lib/staff-growth-client";
import {
  LearningRecordForm,
  emptyLearningForm,
  learningFormFrom,
} from "@/components/LearningRecordForm";
import { LearningRecordList } from "@/components/LearningRecordList";

const KIND_TONE: Record<TimelineKind, string> = {
  joined: "bg-slate-100 text-slate-700",
  one_on_one: "bg-sky-50 text-sky-800",
  learning: "bg-teal-50 text-teal-800",
  member_note: "bg-amber-50 text-amber-800",
  self_review: "bg-violet-50 text-violet-800",
  survey: "bg-rose-50 text-rose-800",
  delegation: "bg-emerald-50 text-emerald-800",
};

export function StaffGrowthDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<KarteDetailResponse | null>(null);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [aiDraftEnabled, setAiDraftEnabled] = useState(false);
  const [bucketMissing, setBucketMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, l] = await Promise.all([fetchKarteDetailApi(userId), fetchLearningApi(userId)]);
      setDetail(d);
      setRecords(l.records);
      setCourses(l.courses);
      setAiDraftEnabled(l.aiDraftEnabled);
      setBucketMissing(l.bucketMissing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };

  // 年表は学びの記録を含むので、追加・編集後は取り直す
  const reloadDetail = async () => {
    try {
      setDetail(await fetchKarteDetailApi(userId));
    } catch {
      /* 年表の更新に失敗しても一覧は更新済み */
    }
  };

  const submitLearning = async (
    id: string,
    input: LearningInput,
    evidence: Blob | null
  ): Promise<string | null> => {
    setBusy(true);
    try {
      if (id === "new") {
        let { record } = await createLearningApi(input, userId);
        if (evidence) {
          try {
            record = (await uploadEvidenceApi(record.id, [evidence])).record;
          } catch (e) {
            setError(`記録は保存しましたが、証跡の添付に失敗しました: ${e instanceof Error ? e.message : ""}`);
          }
        }
        setRecords((prev) => [...prev, record]);
        flash("💾 学びの記録を追加しました");
      } else {
        const { record } = await patchLearningApi(id, input);
        setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
        flash("💾 学びの記録を更新しました");
      }
      setEditing("");
      void reloadDetail();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "保存に失敗しました";
    } finally {
      setBusy(false);
    }
  };

  const removeLearning = async (r: LearningRecord) => {
    if (!confirm("この学びの記録を削除します（証跡の画像も消えます）。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteLearningApi(r.id);
      setRecords((prev) => prev.filter((x) => x.id !== r.id));
      flash("🗑 学びの記録を削除しました");
      void reloadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const replaceRecord = (record: LearningRecord) =>
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));

  if (!loaded) {
    return <p className="text-xs text-gray-500 p-4">読み込み中…</p>;
  }
  if (!detail) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-2">
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error || "対象が見つかりません"}
        </p>
        <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
          ← 一覧へ戻る
        </Link>
      </div>
    );
  }

  const { entry, latestPromise, recentLearning, timeline, goals, today } = detail;
  const isAdmin = detail.isAdmin !== false; // 183: false＝担当の幹部（閲覧のみ）
  const tenure = tenureLabel(entry.joinedOn, today);
  const shownTimeline = showAll ? timeline : timeline.slice(0, 30);

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
        ← スタッフ育成カルテ 一覧
      </Link>

      <header className="rounded-xl border border-gray-200 bg-white p-3">
        <h1 className="text-lg font-bold text-gray-900">
          {entry.name}
          {entry.roleLabel && (
            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-normal">
              {entry.roleLabel}
            </span>
          )}
          {entry.retired && (
            <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600 font-normal">
              退職
            </span>
          )}
        </h1>
        <p className="text-[11px] text-gray-600 mt-1">
          {isAdmin
            ? entry.joinedOn
              ? `入職 ${entry.joinedOn.replaceAll("-", "/")}${tenure ? `（在籍 ${tenure}）` : ""}`
              : "入職日 未登録（スタッフ連絡先に入職日を登録すると表示されます）"
            : "閲覧のみ（担当スタッフ）"}
          {" ・ "}学びの記録 {entry.learningCount}件
        </p>
      </header>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
      )}

      {/* 上部カード（A-4） */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card title="🤝 最新の1on1の約束" href="/one-on-one">
          {latestPromise ? (
            <>
              <p className="text-[11px] text-gray-500">
                {latestPromise.date.replaceAll("-", "/")} ・ {latestPromise.partnerName}さんと
              </p>
              <p className="text-[12px] text-gray-900 whitespace-pre-wrap line-clamp-4">
                {latestPromise.text}
              </p>
              {latestPromise.status && (
                <p className="text-[11px] text-teal-800 mt-1">
                  本人の取り組み状況: {promiseStatusLabel(latestPromise.status)}
                  {latestPromise.note.trim() ? ` ・ ${latestPromise.note}` : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-gray-500">約束が書かれた1on1はまだありません。</p>
          )}
        </Card>
        <Card title="📚 最近の学び" href="#learning">
          {recentLearning.length === 0 ? (
            <p className="text-[11px] text-gray-500">まだ学びの記録がありません。</p>
          ) : (
            <ul className="space-y-1">
              {recentLearning.map((r) => (
                <li key={r.id} className="text-[12px] text-gray-900">
                  <span className="text-[11px] text-gray-500 mr-1">{formatDates(r.dates)}</span>
                  {courses.find((c) => c.id === r.courseId)?.name ?? "（講座不明）"}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="🗓 次回1on1の予定" href="/calendar">
          <p className="text-[11px] text-gray-500">
            {detail.nextOneOnOne
              ? detail.nextOneOnOne.replaceAll("-", "/")
              : "予定の記録はありません（1on1の予定は院内カレンダーで管理）。"}
          </p>
        </Card>
      </div>

      {/* 自分の目標（本人が書く・管理者は閲覧のみ） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <h2 className="text-sm font-medium text-gray-900">🎯 本人の目標</h2>
        {goals.length === 0 ? (
          <p className="text-[11px] text-gray-500 mt-1">本人が書いた目標はまだありません。</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {goals.map((g) => (
              <li key={g.id} className="text-[12px] text-gray-900">
                {g.status === "done" ? "✅" : "▫️"} {g.title}
                {g.dueDate && (
                  <span className="ml-1 text-[11px] text-gray-500">（期限 {g.dueDate.replaceAll("-", "/")}）</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-gray-500 mt-1">目標は本人だけが追加・編集できます。</p>
      </section>

      {/* 成長年表（A-4） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <h2 className="text-sm font-medium text-gray-900">📈 成長年表</h2>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-gray-500">まだ記録がありません。</p>
        ) : (
          <ol className="space-y-2">
            {shownTimeline.map((it, i) => (
              <li key={`${it.kind}-${it.date}-${i}`} className="flex gap-2">
                <span className="shrink-0 w-[5.5em] text-[11px] text-gray-500 pt-0.5">
                  {it.date ? it.date.replaceAll("-", "/") : "日付なし"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-gray-900">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${KIND_TONE[it.kind]}`}>
                      {TIMELINE_KIND_LABEL[it.kind]}
                    </span>
                    {it.title}
                    <Link
                      href={it.href}
                      className="ml-1.5 text-[11px] text-teal-800 underline underline-offset-2"
                    >
                      元の画面へ
                    </Link>
                  </p>
                  {it.survey ? (
                    <SurveyBlock view={it.survey} />
                  ) : (
                    it.body && (
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap line-clamp-6">{it.body}</p>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {timeline.length > 30 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-teal-800 underline underline-offset-2 min-h-[36px]"
          >
            ▼ 残り{timeline.length - 30}件を表示
          </button>
        )}
      </section>

      {/* 学びの記録（管理者は追加・編集できる・B-4） */}
      <section id="learning" className="space-y-2">
        <h2 className="text-sm font-medium text-gray-900">📚 学びの記録（全件）</h2>
        {!isAdmin ? null : editing === "new" ? (
          <LearningRecordForm
            key="new"
            draftKey={`growth:admin-learning:${userId}:new`}
            initial={emptyLearningForm()}
            courses={courses}
            myRequests={[]}
            aiDraftEnabled={aiDraftEnabled}
            busy={busy}
            isEdit={false}
            onCancel={() => setEditing("")}
            onRequestCreated={() => {}}
            onSubmit={(input, evidence) => submitLearning("new", input, evidence)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px]"
          >
            ＋ この人の学びの記録を追加（管理者）
          </button>
        )}
        <LearningRecordList
          records={records}
          courses={courses}
          canEdit={isAdmin}
          busy={busy}
          bucketMissing={bucketMissing}
          editingId={editing}
          renderEditor={(r) => (
            <LearningRecordForm
              key={r.id}
              draftKey={`growth:admin-learning:${userId}:${r.id}`}
              initial={learningFormFrom(r)}
              courses={courses}
              myRequests={[]}
              aiDraftEnabled={false}
              busy={busy}
              isEdit
              onCancel={() => setEditing("")}
              onRequestCreated={() => {}}
              onSubmit={(input) => submitLearning(r.id, input, null)}
            />
          )}
          onEdit={(r) => {
            setEditing(r.id);
            setMsg("");
          }}
          onDelete={removeLearning}
          onUploadEvidence={async (r, files) => {
            const { record } = await uploadEvidenceApi(r.id, files);
            replaceRecord(record);
          }}
          onDeleteEvidence={async (r, path) => {
            const { record } = await deleteEvidenceApi(r.id, path);
            replaceRecord(record);
          }}
        />
      </section>
    </div>
  );
}

/**
 * サーベイ公開の展開表示（指示書181）。
 * 出すのは本人が公開したもの（サーバー側で164を通した後）で、中身は「レーダーチャート・5欲求の点数・結果画像・回答日」まで
 * ＝本人への説明（プロフィールの公開設定）の範囲。順位付け・他者比較・高い/低いの評価語は付けない。
 */
function SurveyBlock({ view }: { view: SurveyView }) {
  const hasValues = NEED_KEYS.some((k) => typeof view.values[k] === "number");
  return (
    <details className="mt-1 rounded-lg border border-rose-100 bg-rose-50/40 p-2" data-survey-block>
      <summary className="text-[11px] text-rose-900 cursor-pointer min-h-[32px] flex items-center gap-2 flex-wrap">
        {NEED_KEYS.filter((k) => typeof view.values[k] === "number")
          .map((k) => `${NEED_LABELS[k]} ${view.values[k]}`)
          .join(" / ") || "点数の記録なし"}
        <span className="text-[10px] text-rose-700 underline underline-offset-2">詳しく見る</span>
      </summary>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {hasValues && (
          <div className="shrink-0">
            <NeedsRadarChart values={view.values} size={200} />
          </div>
        )}
        <div className="min-w-[12em] flex-1 space-y-1">
          <p className="text-[11px] text-gray-500">
            回答日: {view.answeredOn ? view.answeredOn.replaceAll("-", "/") : "記録なし"}
          </p>
          <ul className="space-y-0.5" aria-label="5つの欲求の点数">
            {NEED_KEYS.map((k) => {
              const s = NEED_GROUP_STYLE[k];
              const v = view.values[k];
              const d = view.diff?.[k];
              return (
                <li key={k} className={`flex items-center gap-2 text-[12px] border-l-4 pl-2 ${s.rowBorder}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
                  <span className={`w-[5em] ${s.text}`}>{NEED_LABELS[k]}</span>
                  <span className="tabular-nums text-gray-900">{typeof v === "number" ? v : "—"}</span>
                  {typeof d === "number" && (
                    <span className="text-[10px] text-gray-500 tabular-nums">（前回比 {formatDiff(d)}）</span>
                  )}
                </li>
              );
            })}
          </ul>
          {view.imageUrl &&
            (view.isPdf ? (
              <a
                href={view.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-teal-800 underline underline-offset-2 min-h-[32px]"
              >
                📄 結果PDFを開く（1時間有効のリンク）
              </a>
            ) : (
              <a href={view.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                {/* 署名URLは1時間で切れるため next/image を通さない */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={view.imageUrl}
                  alt="サーベイ結果画像"
                  className="w-28 rounded-md border border-gray-200 object-cover hover:opacity-90"
                />
              </a>
            ))}
          {view.details && (
            <details className="rounded-md border border-gray-200 bg-white p-2">
              <summary className="text-[11px] text-teal-800 cursor-pointer min-h-[32px] flex items-center">
                詳細15項目（本人が「詳細も公開」を選択）
              </summary>
              <table className="w-full text-[11px] mt-1">
                <tbody>
                  {NEEDS_GROUPS.map((group) => {
                    const items = group.items.filter((it) => typeof view.details?.[it.key] === "number");
                    if (items.length === 0) return null;
                    const s = NEED_GROUP_STYLE[group.key];
                    return items.map((it, idx) => (
                      <tr key={it.key} className={`border-l-4 ${s.rowBorder}`}>
                        <td className={`pl-2 pr-1 py-0.5 ${s.text} w-[5em]`}>{idx === 0 ? group.label : ""}</td>
                        <td className="py-0.5 pr-2 text-gray-800">{it.label}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums text-gray-900">{view.details?.[it.key]}</td>
                        <td className="py-0.5 text-[10px] text-gray-500 tabular-nums">
                          {typeof view.detailsDiff?.[it.key] === "number"
                            ? `（前回比 ${formatDiff(view.detailsDiff[it.key])}）`
                            : ""}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </details>
          )}
          <p className="text-[10px] text-gray-500">
            本人が公開した内容だけを表示しています（レーダーチャート・点数・画像
            {view.details ? "・詳細15項目の欲求" : ""}）。相互理解のための共有で、評価・優劣付けには使いません。
          </p>
        </div>
      </div>
    </details>
  );
}

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-gray-900">{title}</p>
        <Link href={href} className="text-[10px] text-teal-800 underline underline-offset-2 shrink-0">
          元の画面へ
        </Link>
      </div>
      {children}
    </div>
  );
}
