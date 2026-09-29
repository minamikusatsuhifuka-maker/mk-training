"use client";
// 育成カルテ・マイ成長記録の印刷用表示（指示書195）
//   ・サイドメニュー・ボタン・入力欄を出さない（画面上の操作は .no-print＝印刷には出ない）。値は文字として表示
//   ・カード・表の途中でページを切らない（break-inside: avoid）。見出しだけがページ末に残らない（break-after: avoid）
//   ・A4縦。図はページ幅。各ページ上部に氏名・印刷日時・印刷した人・「取扱注意（院内限り）」（position: fixed は印刷で各ページに出る）
//   ・項目の選択（B）。表示範囲はサーバー（/api/growth/print）が画面と同じ権限判定で絞る。院長のみの項目は院長にだけ選択肢が出る
//   ・印刷ボタンを押したときだけ log=1 で取り直し、他人のカルテなら記録される（D）

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GrowthMatrixFigure, type MatrixMarker } from "@/components/GrowthMatrixFigure";
import { TransitionCard } from "@/components/GrowthRequirementsTable";
import { PRINT_BROWSER_HINT, PRINT_CONFIDENTIAL, PRINT_NOTE, PRINT_SECTIONS, defaultPrintSections, type PrintRole, type PrintSectionKey } from "@/lib/growth-print";
import { GOAL_LEVELS, TIMELINE_KIND_LABEL, promiseStatusLabel, viewpointLabel, APPROVAL_KINDS, GROWTH_PACES, type Feedback, type Goal, type KarteListEntry, type LearningRecord, type PromiseSummary, type TimelineItem } from "@/lib/staff-growth";
import { NEED_DETAIL_ITEMS, NEED_KEYS, NEED_LABELS } from "@/lib/needs-survey";
import { MEETING_LABEL, NEXT_AXIS_LABEL, transitionSpec, transitionLabel, type AttainmentItem, type GateResult, type ItemReview, type MatrixReview, type MatrixSelf, type StaffGrade, type TransitionKey } from "@/lib/growth-matrix";
import { SCOUTER_SECTIONS, SCOUTER_NOTE, type ScouterResult } from "@/lib/scouter";
import { HIRING_PROFILE_FIELDS, hiringDocKindLabel, type HiringDocKind, type HiringProfile } from "@/lib/hiring-docs";
import type { StaffContact } from "@/lib/staff-contacts";

type PrintData = {
  entry: KarteListEntry;
  role: PrintRole;
  viewerName: string;
  today: string;
  available: PrintSectionKey[];
  sections: PrintSectionKey[];
  position?: { grade: StaffGrade; self: { matrix: MatrixSelf; periodLabel: string; status: string } | null; review: MatrixReview; transition: TransitionKey | null; items: AttainmentItem[]; gates: GateResult[] };
  goals?: Goal[];
  pace?: string;
  feedback?: Feedback[];
  latestPromise?: PromiseSummary | null;
  oneOnOne?: TimelineItem[];
  learning?: Omit<LearningRecord, "evidence">[];
  courses?: { id: string; name: string }[];
  survey?: TimelineItem[];
  timeline?: TimelineItem[];
  hiring?: { profile: HiringProfile; docs: { kind: HiringDocKind; docDate: string; memo: string; fileName: string }[] };
  scouter?: ScouterResult[];
  contact?: StaffContact | null;
};

const d = (s: string) => (s ? s.replaceAll("-", "/") : "");
const PRINT_CSS = `
@page { size: A4 portrait; margin: 18mm 12mm 14mm; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .print-root { padding-top: 0 !important; }
  .print-table thead { display: table-header-group; }
  .print-table tfoot { display: table-footer-group; }
  .print-card { break-inside: avoid; page-break-inside: avoid; }
  .print-h { break-after: avoid; page-break-after: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { text-decoration: none; color: inherit; }
}
@media screen {
  .print-root { max-width: 190mm; margin: 0 auto; background: #fff; }
}
.print-table { width: 100%; border-collapse: collapse; }
.print-table td { padding: 0; vertical-align: top; }
`;

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section className="space-y-1.5" data-print-section={id}>
      <h2 className="print-h text-[13px] font-bold text-gray-900 border-b border-gray-300 pb-0.5">{title}</h2>
      {children}
    </section>
  );
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`print-card rounded border border-gray-200 px-2 py-1.5 ${className}`}>{children}</div>;
}
const Empty = ({ text }: { text: string }) => <p className="text-[11px] text-gray-500">{text}</p>;

export function KartePrintView({ userId, backHref }: { userId?: string; backHref: string }) {
  const [sections, setSections] = useState<PrintSectionKey[] | null>(null);
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(
    async (sel: PrintSectionKey[] | null, log: boolean): Promise<PrintData> => {
      const q = new URLSearchParams();
      if (userId) q.set("user", userId);
      if (sel) q.set("sections", sel.join(","));
      if (log) q.set("log", "1");
      const res = await fetch(`/api/growth/print?${q.toString()}`, { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as PrintData & { error?: string };
      if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
      return j;
    },
    [userId]
  );

  // 初回: 立場を知るために既定なしで取り、既定の項目で取り直す
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const first = await fetchData(null, false);
        const def = defaultPrintSections(first.role);
        const j = await fetchData(def, false);
        if (alive) {
          setSections(def);
          setData(j);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchData]);

  const toggle = async (k: PrintSectionKey) => {
    if (!sections) return;
    const next = sections.includes(k) ? sections.filter((x) => x !== k) : [...sections, k];
    setSections(next);
    setBusy(true);
    try {
      setData(await fetchData(next, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    if (!sections) return;
    setBusy(true);
    try {
      setData(await fetchData(sections, true)); // D: 他人のカルテならここで記録される
      setTimeout(() => window.print(), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const printedAt = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
        <Link href={backHref} className="text-xs text-teal-800 underline underline-offset-2">← 戻る</Link>
      </div>
    );
  }
  if (!data || !sections) return <p className="p-4 text-xs text-gray-500">読み込み中…</p>;

  const { entry, role } = data;
  const pos = data.position;
  const self = pos?.self?.matrix ?? null;
  const agreed = pos?.review.agreed[0] ?? null;
  const markers: MatrixMarker[] = [];
  if (agreed) markers.push({ s: agreed.s, m: agreed.m, label: "合意", color: "#0f766e" });
  if (self?.s && self?.m) markers.push({ s: self.s, m: self.m, label: "自己評価", color: "#7c3aed", hollow: true });
  const spec = pos?.transition ? transitionSpec(pos.transition) : undefined;
  const courseName = (id: string) => data.courses?.find((c) => c.id === id)?.name ?? "（講座不明）";
  const has = (k: PrintSectionKey) => sections.includes(k);

  return (
    <div className="print-root text-[11px] text-gray-900 p-3 sm:p-4 space-y-3" data-karte-print data-role={role}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* 画面上の操作（印刷には出ない） */}
      <div className="no-print rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2" data-print-controls>
        <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1" data-print-hint>{PRINT_BROWSER_HINT}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={backHref} className="text-xs text-teal-800 underline underline-offset-2">← 戻る</Link>
          <button type="button" onClick={() => void print()} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]" data-print-run>
            🖨 印刷する
          </button>
        </div>
        <p className="text-[11px] text-gray-700">印刷する項目（{role === "admin" ? "院長" : role === "self" ? "本人" : "担当幹部"}が見られる範囲だけ）</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1" data-print-sections>
          {PRINT_SECTIONS.filter((s) => data.available.includes(s.key)).map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-[12px] text-gray-800 min-h-[32px]">
              <input type="checkbox" checked={sections.includes(s.key)} disabled={busy} onChange={() => void toggle(s.key)} data-print-section-toggle={s.key} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* 各ページ上部（thead は印刷で各ページの先頭に繰り返される） */}
      <table className="print-table">
        <thead>
          <tr>
            <td>
              <div className="flex items-center justify-between gap-2 border-b border-gray-400 pb-0.5 mb-2 text-[10px] text-gray-700" data-print-head>
                <span className="font-bold text-gray-900">{entry.name}{entry.roleLabel ? `（${entry.roleLabel}）` : ""} — 育成カルテ</span>
                <span>印刷 {printedAt} ／ 印刷した人: {data.viewerName}</span>
                <span className="font-bold text-red-700">{PRINT_CONFIDENTIAL}</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="space-y-3">
      <p className="text-[11px] text-gray-800 border border-gray-300 rounded px-2 py-1" data-print-note>{PRINT_NOTE}</p>
      {entry.joinedOn && <p className="text-[11px] text-gray-700">入職 {d(entry.joinedOn)}</p>}

      {has("position") && pos && (
        <Section id="position" title="🧭 現在地（成長マトリクス）">
          <Card>
            <p>
              等級: <strong>{pos.grade.grade || "未設定"}</strong>　キャリアライン: <strong>{pos.grade.careerLine || "未設定"}</strong>
              {pos.transition && <>　次の移行: {transitionLabel(pos.transition)}</>}
            </p>
            <p>
              合意した位置: <strong>{agreed ? `${agreed.s} × ${agreed.m}` : "未記録"}</strong>{agreed && `（${MEETING_LABEL[agreed.meeting]} ${d(agreed.date)}）`}　本人の自己評価: <strong>{self?.s && self?.m ? `${self.s} × ${self.m}` : "未記入"}</strong>{pos.self && `（${pos.self.periodLabel}）`}
            </p>
            {self?.nextAxis && (
              <p>
                次に伸ばす軸: <strong>{NEXT_AXIS_LABEL[self.nextAxis]}</strong>{self.nextAxisReason && ` — ${self.nextAxisReason}`}
              </p>
            )}
          </Card>
          <Card>
            <GrowthMatrixFigure compact markers={markers} />
          </Card>
        </Section>
      )}

      {has("transition") && pos && (
        <Section id="transition" title={`次の移行${pos.transition ? ` — ${transitionLabel(pos.transition)}` : ""}`}>
          {!pos.transition || !spec ? (
            <Empty text="次の移行が決まっていません（等級の設定、または自己評価シートで移行を選ぶ）。" />
          ) : (
            <>
              <Card>
                <TransitionCard
                  t={spec}
                  hl
                  marks={(key) => {
                    const st = self?.items[key];
                    const rv: ItemReview | undefined = pos.review.itemReviews[key];
                    return st?.status || rv ? { self: st?.status, review: rv } : undefined;
                  }}
                  gateMark={(label) => {
                    const g = pos.gates.find((x) => x.gate.label === label);
                    return g ? { ok: g.ok } : undefined;
                  }}
                />
              </Card>
              {self && Object.entries(self.items).some(([, v]) => v.evidence.length > 0) && (
                <Card>
                  <p className="font-medium">根拠の記録</p>
                  <ul className="list-disc pl-4">
                    {pos.items.filter((it) => (self.items[it.key]?.evidence.length ?? 0) > 0).map((it) => (
                      <li key={it.key}>
                        {it.text.replace(/\*\*/g, "")}
                        <ul className="list-[circle] pl-4 text-gray-700">
                          {self.items[it.key].evidence.map((e, i) => (
                            <li key={i}>{d(e.date)} {e.scene}{e.linkKind ? "（記録に紐づけ）" : ""}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </Section>
      )}

      {has("goals") && (
        <Section id="goals" title="🎯 目標（目的 → 3年後 → 年間 → 半期 → 月 → 週）">
          {data.pace && <p className="text-gray-700">希望のペース: {GROWTH_PACES.find((p) => p.value === data.pace)?.label ?? data.pace}</p>}
          {(data.goals ?? []).length === 0 ? (
            <Empty text="まだ目標がありません。" />
          ) : (
            GOAL_LEVELS.map((lv) => {
              const list = (data.goals ?? []).filter((g) => g.level === lv.value);
              if (list.length === 0) return null;
              return (
                <Card key={lv.value}>
                  <p className="font-medium">{lv.label}</p>
                  <ul className="list-disc pl-4">
                    {list.map((g) => (
                      <li key={g.id}>
                        {g.title}
                        {g.status === "done" && <span className="ml-1 text-gray-600">（達成）</span>}
                        {g.agreedOn && <span className="ml-1 text-gray-600">合意 {d(g.agreedOn)}{g.agreedByName ? `・${g.agreedByName}` : ""}</span>}
                        {g.detail && <span className="block text-gray-700 whitespace-pre-wrap">{g.detail}</span>}
                        {g.support && <span className="block text-gray-700">機会・支援: {g.support}</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </Section>
      )}

      {has("oneonone") && (
        <Section id="oneonone" title="🤝 1on1の約束・🌟 フィードバック">
          <Card>
            <p className="font-medium">最新の1on1の約束</p>
            {data.latestPromise ? (
              <p>
                {d(data.latestPromise.date)} {data.latestPromise.partnerName}さんと: {data.latestPromise.text}
                {data.latestPromise.status && <span className="text-teal-800">（{promiseStatusLabel(data.latestPromise.status)}{data.latestPromise.note ? `・${data.latestPromise.note}` : ""}）</span>}
              </p>
            ) : (
              <Empty text="約束が書かれた1on1はまだありません。" />
            )}
            {(data.oneOnOne ?? []).length > 0 && (
              <ul className="list-disc pl-4 mt-1">
                {(data.oneOnOne ?? []).map((t, i) => (
                  <li key={i}>
                    {d(t.date)} {t.title}
                    {t.body && <span className="block text-gray-700 whitespace-pre-wrap">{t.body}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(data.feedback ?? []).length === 0 ? (
            <Empty text="フィードバックの記録はまだありません。" />
          ) : (
            (data.feedback ?? []).map((f) => (
              <Card key={f.id}>
                <p className="font-medium">
                  {f.type === "positive" ? "ポジティブ" : "ギャップ"} {d(f.date)} {f.scene && `・${f.scene}`} <span className="text-gray-600">（記録: {f.authorName}）</span>
                </p>
                {f.type === "positive" ? (
                  <>
                    {f.approval && <p>承認: {APPROVAL_KINDS.find((a) => a.value === f.approval)?.label ?? f.approval}</p>}
                    <p className="whitespace-pre-wrap">{f.whatGood}</p>
                    {f.viewpoints.length > 0 && <p className="text-gray-700">観点: {f.viewpoints.map(viewpointLabel).join("・")}</p>}
                    {f.reaction && <p className="text-gray-700">本人の反応: {f.reaction}</p>}
                  </>
                ) : (
                  <>
                    {f.fact && <p>① 事実: {f.fact}</p>}
                    {f.iMessage && <p>　iメッセージ: {f.iMessage}</p>}
                    {f.issue && <p>② すり合わせ: {f.issue}</p>}
                    {f.plan && <p>③ 改善計画: {f.plan}{f.planDue ? `（期限 ${d(f.planDue)}）` : ""}</p>}
                    {f.progress && <p className="text-gray-700">進捗（本人）: {f.progress}</p>}
                    {f.result && <p className="text-gray-700">その後: {f.result}</p>}
                  </>
                )}
              </Card>
            ))
          )}
        </Section>
      )}

      {has("learning") && (
        <Section id="learning" title="📚 学びの記録">
          {(data.learning ?? []).length === 0 ? (
            <Empty text="まだ学びの記録がありません。" />
          ) : (
            <Card>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-gray-600 border-b border-gray-200">
                    <th className="pr-2 py-0.5 w-[7em]">参加日</th>
                    <th className="pr-2 py-0.5">講座</th>
                    <th className="pr-2 py-0.5">学んだこと・次にやること</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.learning ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 align-top">
                      <td className="pr-2 py-0.5 whitespace-nowrap">{d(r.startDate)}{r.endDate && r.endDate !== r.startDate ? `〜${d(r.endDate).slice(5)}` : ""}</td>
                      <td className="pr-2 py-0.5">{courseName(r.courseId)}{r.venueName ? `（${r.venueName}）` : ""}</td>
                      <td className="pr-2 py-0.5 whitespace-pre-wrap">{r.learned}{r.nextAction ? `\n→ ${r.nextAction}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Section>
      )}

      {has("survey") && (
        <Section id="survey" title="🌈 5つの基本的欲求サーベイ（本人が公開した分）">
          {(data.survey ?? []).length === 0 ? (
            <Empty text="公開されたサーベイはありません。" />
          ) : (
            (data.survey ?? []).map((t, i) => (
              <Card key={i}>
                <p className="font-medium">{t.title} {d(t.date)}</p>
                {t.survey && (
                  <>
                    <p>
                      {NEED_KEYS.filter((k) => typeof t.survey!.values[k] === "number").map((k) => `${NEED_LABELS[k]} ${t.survey!.values[k]}${typeof t.survey!.diff?.[k] === "number" ? `（前回比 ${t.survey!.diff![k]! >= 0 ? "+" : ""}${t.survey!.diff![k]}）` : ""}`).join("　")}
                    </p>
                    {t.survey.details && (
                      <p className="text-gray-700">
                        {NEED_DETAIL_ITEMS.filter((it) => typeof t.survey!.details?.[it.key] === "number").map((it) => `${it.label} ${t.survey!.details![it.key]}`).join("・")}
                      </p>
                    )}
                  </>
                )}
              </Card>
            ))
          )}
        </Section>
      )}

      {has("timeline") && (
        <Section id="timeline" title="📈 成長年表">
          {(data.timeline ?? []).length === 0 ? (
            <Empty text="まだ記録がありません。" />
          ) : (
            <Card>
              <ul className="space-y-0.5">
                {(data.timeline ?? []).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-[6em] shrink-0 text-gray-600">{d(t.date) || "日付なし"}</span>
                    <span className="min-w-0">
                      <span className="text-gray-600">[{TIMELINE_KIND_LABEL[t.kind]}]</span> {t.title}
                      {t.body && <span className="block text-gray-700 whitespace-pre-wrap">{t.body}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
      )}

      {role === "admin" && has("hiring") && data.hiring && (
        <Section id="hiring" title="📁 採用資料・経歴（院長のみ）">
          <Card>
            {HIRING_PROFILE_FIELDS.map((f) => (
              <p key={f.key}>
                <span className="text-gray-600">{f.group}: {f.label}</span> — <span className="whitespace-pre-wrap">{data.hiring!.profile[f.key] || "（未記入）"}</span>
              </p>
            ))}
            {data.hiring.docs.length > 0 && <p className="text-gray-700 mt-1">資料: {data.hiring.docs.map((x) => `${hiringDocKindLabel(x.kind)} ${d(x.docDate)}${x.memo ? `（${x.memo}）` : ""}`).join("・")}（原本は印刷しません）</p>}
          </Card>
        </Section>
      )}

      {role === "admin" && has("scouter") && (
        <Section id="scouter" title="🧭 適性検査（スカウター）（院長のみ）">
          {(data.scouter ?? []).length === 0 ? (
            <Empty text="転記した検査結果はありません。" />
          ) : (
            (data.scouter ?? []).map((r) => (
              <Card key={r.id}>
                <p className="font-medium">受検日 {d(r.testDate) || "未設定"}{r.testName ? `・${r.testName}` : ""}</p>
                {SCOUTER_SECTIONS.map((s) => (
                  <p key={s.key}>
                    <span className="text-gray-600">{s.label}:</span> {s.scales.map((n) => `${n} ${r.sections[s.key][n] || "–"}`).join("、")}
                  </p>
                ))}
                {r.jobFit.length > 0 && <p><span className="text-gray-600">7 職務適性:</span> {r.jobFit.map((x) => `${x.name} ${x.score}`).join("、")}{r.power ? `　戦闘力 ${r.power}` : ""}</p>}
                {r.points && (
                  <div className="mt-1">
                    <p className="font-medium">AIのポイント整理</p>
                    {[["① 強みと活かし方", r.points.strengths], ["② 関わり方のヒント", r.points.hints], ["③ 1on1で確かめたい問い", r.points.questions]].map(([label, list]) => (
                      <div key={label as string}>
                        <p className="text-gray-700">{label as string}</p>
                        <ul className="list-disc pl-4">
                          {(list as { text: string; evidence: string }[]).map((it, i) => (
                            <li key={i}>{it.text}{it.evidence ? <span className="text-gray-600">（{it.evidence}）</span> : null}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <p className="text-gray-600">{SCOUTER_NOTE}</p>
                  </div>
                )}
              </Card>
            ))
          )}
        </Section>
      )}

      {role === "admin" && has("contacts") && (
        <Section id="contacts" title="📇 連絡先・家族構成（院長のみ）">
          {!data.contact ? (
            <Empty text="連絡先は登録されていません。" />
          ) : (
            <Card>
              <p>{data.contact.name}{data.contact.kana ? `（${data.contact.kana}）` : ""}　{data.contact.birthday && `生年月日 ${d(data.contact.birthday)}`}</p>
              {data.contact.address && <p>住所: {data.contact.address}</p>}
              <p>
                {data.contact.phoneMobile && `携帯 ${data.contact.phoneMobile}　`}
                {data.contact.phoneHome && `自宅 ${data.contact.phoneHome}　`}
                {data.contact.privateEmail && `メール ${data.contact.privateEmail}`}
              </p>
              {data.contact.emergency.length > 0 && <p>緊急連絡先: {data.contact.emergency.map((e) => `${e.name}${e.relation ? `（${e.relation}）` : ""} ${e.phone}`).join("／")}</p>}
              {data.contact.family.length > 0 && <p>家族構成: {data.contact.family.map((f) => `${f.relation} ${f.count ? `${f.count}人` : ""}`).join("・")}</p>}
            </Card>
          )}
        </Section>
      )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
