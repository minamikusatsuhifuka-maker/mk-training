"use client";

// スタッフ育成カルテ 一覧（指示書179 A-3／A-5）— 管理者のみ到達する
// - 在籍スタッフの一覧（職種・入職日・在籍年数）。「退職者も表示」の切り替え（169と同じ）
// - 検索: カルテに集約した本文を横断（サーバー側・管理者のみ）
// - 絞り込み: 職種・入職年・在籍/退職・受講した講座・タグ **だけ**
//   （家族構成・適性検査・サーベイの値・評価点は、一覧のデータに項目として存在しない）

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EMPTY_KARTE_FILTER,
  TIMELINE_KIND_LABEL,
  filterKarteEntries,
  joinedYearOf,
  tenureLabel,
  type Course,
  type KarteFilter,
  type KarteListEntry,
  type SearchHit,
  type TimelineKind,
} from "@/lib/staff-growth";
import { fetchKarteListApi, searchKarteApi } from "@/lib/staff-growth-client";

export function StaffGrowthKarte() {
  const [entries, setEntries] = useState<KarteListEntry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [today, setToday] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<KarteFilter>(EMPTY_KARTE_FILTER);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  // 187 C: 入職予定者（院長のみ）
  const [prospectForm, setProspectForm] = useState<{ open: boolean; name: string; email: string; expectedJoinOn: string }>({ open: false, name: "", email: "", expectedJoinOn: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await fetchKarteListApi();
      setEntries(j.entries);
      setCourses(j.courses);
      setToday(j.today);
      setTableMissing(j.tableMissing);
      setIsAdmin(j.isAdmin !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.roleId) m.set(e.roleId, e.roleLabel || e.roleId);
    return Array.from(m, ([id, label]) => ({ id, label }));
  }, [entries]);
  const yearOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => joinedYearOf(e.joinedOn)).filter(Boolean))).sort(
        (a, b) => b.localeCompare(a)
      ),
    [entries]
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.tags))).sort((a, b) => a.localeCompare(b, "ja")),
    [entries]
  );
  const usedCourses = useMemo(() => {
    const used = new Set(entries.flatMap((e) => e.courseIds));
    return courses.filter((c) => used.has(c.id));
  }, [entries, courses]);

  const hitMap = useMemo(() => new Map((hits ?? []).map((h) => [h.userId, h.hits])), [hits]);

  const prospects = useMemo(() => entries.filter((e) => e.prospect), [entries]);
  const staffEntries = useMemo(() => entries.filter((e) => !e.prospect), [entries]);
  const visible = useMemo(() => {
    const filtered = filterKarteEntries(staffEntries, filter);
    return hits ? filtered.filter((e) => hitMap.has(e.userId)) : filtered;
  }, [staffEntries, filter, hits, hitMap]);

  const runSearch = async () => {
    const term = q.trim();
    if (!term) {
      setHits(null);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const j = await searchKarteApi(term);
      setHits(j.hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const retiredCount = entries.filter((e) => e.retired).length;

  const prospectApi = async (init: RequestInit): Promise<Record<string, unknown>> => {
    const res = await fetch("/api/admin/hiring/prospects", { cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
    return j;
  };
  const runProspect = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">📗 スタッフ育成カルテ</h1>
          {isAdmin ? (
            <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
              1on1・学びの記録・メンバーノート・自己評価・公開されたサーベイ・権限委譲を、人ごとに時系列で見る画面です。
              <strong>元の画面で見られないものは、ここでも見えません</strong>（非公開のサーベイは管理者にも出ません）。
              家族構成はこの画面には出しません。
            </p>
          ) : (
            <p className="text-[11px] text-gray-600 mt-1 leading-relaxed" data-delegate-note>
              院長から担当を指定されたスタッフのカルテを<strong>閲覧</strong>できます（追加・編集はできません）。
              見られるのは「学びの記録・本人の目標・1on1の約束と取り組み状況・本人が公開したサーベイ」だけです。
              閲覧は記録されます。
            </p>
          )}
        </div>
        {isAdmin && (
          <Link
            href="/staff-growth/courses"
            className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[40px] flex items-center"
          >
            🗂 講座マスタ・設定
          </Link>
        )}
      </header>

      {tableMissing && isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-gray-800 leading-relaxed">
          学びの記録のテーブルがまだ作られていません。
          <code className="mx-1">~/Downloads/179_スタッフ育成カルテ_テーブル作成.sql</code>
          を Supabase の SQL Editor で実行してください（実行までは学びの記録が空のまま表示されます）。
        </div>
      )}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}

      {/* 検索（管理者のみ・サーバー側で本文を横断） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="本文を横断検索（例: レーザー 接遇）"
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px]"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
          >
            {searching ? "検索中…" : "検索"}
          </button>
          {hits && (
            <button
              type="button"
              onClick={() => {
                setHits(null);
                setQ("");
              }}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 min-h-[44px]"
            >
              解除
            </button>
          )}
        </form>

        {/* 絞り込み（A-5の5軸だけ） */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select
            value={filter.roleId}
            onChange={(e) => setFilter((f) => ({ ...f, roleId: e.target.value }))}
            className={selectClass}
            aria-label="職種"
          >
            <option value="">職種: すべて</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={filter.joinedYear}
            onChange={(e) => setFilter((f) => ({ ...f, joinedYear: e.target.value }))}
            className={selectClass}
            aria-label="入職年"
          >
            <option value="">入職年: すべて</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            value={filter.employment}
            onChange={(e) =>
              setFilter((f) => ({ ...f, employment: e.target.value as KarteFilter["employment"] }))
            }
            className={selectClass}
            aria-label="在籍"
          >
            <option value="active">在籍のみ</option>
            <option value="all">退職者も表示{retiredCount ? `（${retiredCount}人）` : ""}</option>
            <option value="retired">退職者のみ</option>
          </select>
          <select
            value={filter.courseId}
            onChange={(e) => setFilter((f) => ({ ...f, courseId: e.target.value }))}
            className={selectClass}
            aria-label="受講した講座"
          >
            <option value="">講座: すべて</option>
            {usedCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filter.tag}
            onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
            className={selectClass}
            aria-label="タグ"
          >
            <option value="">タグ: すべて</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* 187 C: 入職予定者（院長のみ・アカウント作成前） */}
      {isAdmin && loaded && (
        <section className="rounded-xl border border-orange-200 bg-orange-50/30 p-3 space-y-2" data-prospects>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-gray-900">🆕 入職予定者（アカウント作成前・院長のみ）{prospects.length > 0 ? `（${prospects.length}人）` : ""}</h2>
            {!prospectForm.open && (
              <button type="button" onClick={() => setProspectForm((f) => ({ ...f, open: true }))} className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[40px]">
                ＋ 入職予定者を登録
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-600 leading-relaxed">
            対象は<strong>内定後（入職予定）の人だけ</strong>です。選考中の応募者は登録しません。登録すると、アカウントを作る前から採用資料の登録・AI整理・連絡先の反映ができます。
            アカウントができたら、メールが一致する候補を院長が1タップで紐づけます（自動では紐づけません）。
          </p>
          {prospectForm.open && (
            <div className="rounded-lg border border-teal-200 bg-white p-2 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={prospectForm.name} onChange={(e) => setProspectForm((f) => ({ ...f, name: e.target.value }))} placeholder="氏名（必須）" className={selectClass} aria-label="入職予定者の氏名" />
                <input value={prospectForm.email} onChange={(e) => setProspectForm((f) => ({ ...f, email: e.target.value }))} placeholder="メールアドレス（紐づけの照合用・任意）" className={selectClass} aria-label="入職予定者のメール" />
                <input type="date" value={prospectForm.expectedJoinOn} onChange={(e) => setProspectForm((f) => ({ ...f, expectedJoinOn: e.target.value }))} className={selectClass} aria-label="入職予定日" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !prospectForm.name.trim()}
                  onClick={() =>
                    void runProspect(async () => {
                      await prospectApi({ method: "POST", body: JSON.stringify({ name: prospectForm.name.trim(), email: prospectForm.email.trim(), expectedJoinOn: prospectForm.expectedJoinOn }) });
                      setProspectForm({ open: false, name: "", email: "", expectedJoinOn: "" });
                      return "🆕 入職予定者を登録しました";
                    })
                  }
                  className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
                >
                  💾 登録
                </button>
                <button type="button" onClick={() => setProspectForm({ open: false, name: "", email: "", expectedJoinOn: "" })} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[44px]">
                  キャンセル
                </button>
              </div>
            </div>
          )}
          {prospects.length > 0 && (
            <ul className="space-y-2">
              {prospects.map((e) => {
                const pr = e.prospect!;
                return (
                  <li key={e.userId} className={`rounded-lg border bg-white p-2 space-y-1 ${pr.stale ? "border-amber-400" : "border-gray-200"}`} data-prospect data-stale={pr.stale ? "1" : "0"} data-status={pr.status}>
                    <p className="text-sm text-gray-900">
                      <Link href={`/staff-growth/${encodeURIComponent(e.userId)}`} className="underline underline-offset-2 text-teal-800">{e.name}</Link>
                      <span className="ml-2 text-[11px] text-gray-600">{pr.expectedJoinOn ? `入職予定 ${pr.expectedJoinOn.replaceAll("-", "/")}` : "入職予定日 未設定"}</span>
                      {pr.status === "declined" && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600">入職しなかった</span>}
                      {pr.stale && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900" data-stale-mark>⚠ 入職予定日から60日以上・要確認</span>}
                    </p>
                    {pr.candidate && pr.status === "expected" && (
                      <p className="text-[11px] text-teal-900 bg-teal-50 border border-teal-200 rounded-md p-1.5 flex flex-wrap items-center gap-2" data-link-candidate>
                        🔗 メールが一致するアカウント: <strong>{pr.candidate.name}</strong>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`${e.name} さんを アカウント「${pr.candidate!.name}」に紐づけます。連絡先・採用資料・経歴がそのスタッフのカルテに移ります。よろしいですか？`)) return;
                            void runProspect(async () => {
                              await prospectApi({ method: "PATCH", body: JSON.stringify({ id: e.userId, action: "link", userId: pr.candidate!.userId }) });
                              return "🔗 アカウントに紐づけました";
                            });
                          }}
                          className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-[11px] hover:bg-teal-700 disabled:opacity-40 min-h-[36px]"
                        >
                          このアカウントに紐づける
                        </button>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {pr.status === "expected" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`${e.name} さんに「入職しなかった」を付けます。よろしいですか？（このあと関連情報をまとめて削除できます）`)) return;
                            void runProspect(async () => {
                              await prospectApi({ method: "PATCH", body: JSON.stringify({ id: e.userId, action: "decline" }) });
                              return "「入職しなかった」を付けました。関連情報をまとめて削除できます";
                            });
                          }}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-[11px] hover:bg-gray-50 disabled:opacity-40 min-h-[36px]"
                        >
                          入職しなかった
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`${e.name} さんの連絡先・採用資料・経歴をまとめて削除します。\n\n削除すると元に戻せません。よろしいですか？`)) return;
                            void runProspect(async () => {
                              await prospectApi({ method: "DELETE", body: JSON.stringify({ id: e.userId }) });
                              return "🗑 関連情報をまとめて削除しました";
                            });
                          }}
                          className="px-3 py-1.5 border border-red-300 text-red-700 rounded-full text-[11px] hover:bg-red-50 disabled:opacity-40 min-h-[36px]"
                          data-delete-prospect
                        >
                          🗑 連絡先・採用資料・経歴をまとめて削除
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-600">
          {hits ? "検索に当たる人がいません。" : "条件に合う人がいません。"}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => {
            const tenure = tenureLabel(e.joinedOn, today);
            const h = hitMap.get(e.userId);
            return (
              <li key={e.userId}>
                <Link
                  href={`/staff-growth/${encodeURIComponent(e.userId)}`}
                  className="block rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50 min-h-[52px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">{e.name}</span>
                      {e.roleLabel && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {e.roleLabel}
                        </span>
                      )}
                      {e.retired && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600">
                          退職
                        </span>
                      )}
                      <span className="block text-[11px] text-gray-600">
                        {e.joinedOn
                          ? `入職 ${e.joinedOn.replaceAll("-", "/")}${tenure ? `（${tenure}）` : ""}`
                          : "入職日 未登録"}
                        {" ・ "}学び {e.learningCount}件
                        {e.lastLearningOn ? `（最新 ${e.lastLearningOn.replaceAll("-", "/")}）` : ""}
                      </span>
                      {h && (
                        <span className="block text-[11px] text-teal-800">
                          🔍{" "}
                          {(Object.keys(h) as TimelineKind[])
                            .map((k) => `${TIMELINE_KIND_LABEL[k]} ${h[k]}件`)
                            .join(" / ")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">›</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const selectClass =
  "w-full rounded-md border border-gray-200 px-2 py-2 text-[12px] min-h-[40px] bg-white";
