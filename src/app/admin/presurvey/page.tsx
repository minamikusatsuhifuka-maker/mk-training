"use client";

// 📝 1on1の事前アンケートの質問（指示書197・197-補 → 204 v2で2部構成）— 院長のみ
//
// ・第1部「働く目的と目標」／第2部「今回の1on1」に分けて表示する（204 §7）
// ・**カルテと連動する5問（1-1・1-3〜1-6）は削除・種類の変更ができない**。
//   文言・ヒント・注記・添え書きは直せる（204 §7）
// ・定義は content_store `one_on_one_presurvey_config`（書き込みは管理者のみ・サーバー側で強制）
// ・削除は置かず非表示運用（過去の回答は回答時点の質問文を持っているので壊れない）
// ・知らせ（提出期限の7日前・3日前・前日・当日の朝8時）と「1on1の知らせ（事前アンケート・予定）をメールでも送る」の案内もここに置く

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PRESURVEY_INTRO,
  PRESURVEY_KINDS,
  PRESURVEY_PARTS,
  PRESURVEY_SLOTS,
  defaultPresurveyQuestions,
  genPresurveyQuestionId,
  isKarteLinked,
  loadPresurveyQuestions,
  savePresurveyQuestions,
  type PresurveyKind,
  type PresurveyPart,
  type PresurveyQuestion,
  type PresurveySlot,
} from "@/lib/one-on-one-presurvey";
import { PRESURVEY_ALERT_STAGES, PRESURVEY_ALERT_HOUR_JST } from "@/lib/one-on-one-schedule";
import { goalLevelLabel } from "@/lib/staff-growth";

export default function PresurveyAdminPage() {
  const [questions, setQuestions] = useState<PresurveyQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPart, setNewPart] = useState<PresurveyPart>(2);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPresurveyQuestions()
      .then(setQuestions)
      .catch(() => setQuestions(defaultPresurveyQuestions()))
      .finally(() => setLoaded(true));
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 4000);
  };

  const update = (id: string, patch: Partial<PresurveyQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  /** 同じ部の中だけで並べ替える */
  const move = (id: string, dir: -1 | 1) =>
    setQuestions((qs) => {
      const q = qs.find((x) => x.id === id);
      if (!q) return qs;
      const sameIdx = qs.map((x, i) => ({ x, i })).filter(({ x }) => x.part === q.part);
      const at = sameIdx.findIndex(({ x }) => x.id === id);
      const to = sameIdx[at + dir];
      if (!to) return qs;
      const next = [...qs];
      const a = sameIdx[at].i;
      [next[a], next[to.i]] = [next[to.i], next[a]];
      return next;
    });

  const add = () => {
    const text = newText.trim();
    if (!text) {
      setError("質問文を入力してください");
      return;
    }
    setQuestions((qs) => [
      ...qs,
      {
        id: genPresurveyQuestionId(),
        part: newPart,
        text,
        required: false,
        kind: "text",
        choices: [],
        followUpLabel: "",
        note: "",
        hint: "",
        bookHint: "",
        bookSource: "",
        role: "",
        slot: newPart === 1 ? "w" : "top",
        prefill: "blank",
        karteLevel: "",
      },
    ]);
    setNewText("");
    setError("");
  };

  const resetToDefault = () => {
    if (
      !confirm(
        "質問を初期の2部構成（指示書204 v2）に戻しますか？\n（追加した質問は一覧から消えますが、保存済みの回答は回答時点の質問文を持っているので消えません。保存ボタンを押すまで確定しません）"
      )
    ) {
      return;
    }
    setQuestions(defaultPresurveyQuestions());
  };

  const handleSave = async () => {
    if (questions.some((q) => !q.text.trim())) {
      setError("質問文が空の項目があります");
      return;
    }
    const needChoices = questions.filter(
      (q) =>
        (q.kind === "choice_text" || q.kind === "choice_scene" || q.kind === "promise_check") &&
        q.choices.filter((c) => c.trim()).length === 0
    );
    if (needChoices.length > 0) {
      setError(`選択肢が必要な質問に選択肢がありません（「${needChoices[0].text}」）`);
      return;
    }
    setSaving(true);
    setError("");
    const body = questions.map((q) => ({
      ...q,
      text: q.text.trim(),
      choices: q.choices.map((c) => c.trim()).filter((c) => !!c),
    }));
    const ok = await savePresurveyQuestions(body);
    setSaving(false);
    if (!ok) {
      setError("保存に失敗しました");
      return;
    }
    setQuestions(body);
    flash("💾 質問を保存しました（スタッフの事前アンケートに反映されます）");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          📝 1on1の事前アンケートの質問
        </h1>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          スタッフが1on1の前に答える質問です。<strong>第1部「働く目的と目標」</strong>は毎回、前回の答え
          （＝育成カルテの目標）が入った状態で見直します。<strong>第2部「今回の1on1」</strong>はその回のことを書きます。
          回答は1on1画面のRWDEPの各欄の隣に出ます（置き場所は各質問の「出す場所」で決まります）。
        </p>
        <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          スタッフの画面には冒頭に常時こう出ます: 「{PRESURVEY_INTRO}」
        </p>
        <p className="text-xs text-slate-600 mt-2">
          <Link href="/admin/presurvey-answers" className="text-teal-700 underline underline-offset-2">
            📝 回答を見る（1on1の予定ごと）
          </Link>
        </p>
        <PresurveyAccessNote />
        <AlertNote />
      </div>

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        {!loaded ? (
          <p className="text-sm text-slate-500">読み込み中...</p>
        ) : (
          <>
            {PRESURVEY_PARTS.map((part) => {
              const list = questions.filter((q) => q.part === part.value);
              return (
                <section key={part.value} className="space-y-3" data-presurvey-part={part.value}>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">{part.title}</h2>
                    <p className="text-[11px] text-slate-500">{part.lead}</p>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400">この部の質問はありません</p>
                  ) : (
                    <ul className="space-y-3">
                      {list.map((q, i) => {
                        const locked = isKarteLinked(q);
                        return (
                          <li
                            key={q.id}
                            data-presurvey-question={q.id}
                            className={`rounded-xl border px-3 py-3 space-y-2 ${
                              q.hidden
                                ? "bg-slate-100 border-slate-200 opacity-70"
                                : locked
                                  ? "bg-teal-50/60 border-teal-200"
                                  : "bg-slate-50 border-slate-100"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-medium text-slate-500 pt-2 w-10 shrink-0">
                                {part.value}-{i + 1}
                              </span>
                              <textarea
                                value={q.text}
                                onChange={(e) => update(q.id, { text: e.target.value })}
                                rows={2}
                                data-presurvey-text
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y bg-white"
                              />
                              <div className="flex flex-col gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => move(q.id, -1)}
                                  disabled={i === 0}
                                  className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => move(q.id, 1)}
                                  disabled={i === list.length - 1}
                                  className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>

                            {locked && (
                              <p
                                className="text-[11px] text-teal-900 bg-white border border-teal-200 rounded-lg px-2.5 py-1.5 ml-10"
                                data-presurvey-locked
                              >
                                🔗 育成カルテの「{goalLevelLabel(q.karteLevel || "purpose")}」と同じものです。
                                提出すると、変わったときだけカルテの目標が更新されます。
                                <strong>この質問は削除・答え方の変更ができません</strong>（文言とヒントは直せます）。
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 ml-10">
                              <button
                                type="button"
                                onClick={() => !locked && update(q.id, { required: !q.required })}
                                disabled={locked}
                                className={`text-xs px-2.5 py-1 border rounded-full disabled:opacity-60 ${
                                  q.required
                                    ? "bg-rose-50 border-rose-200 text-rose-800"
                                    : "bg-white border-slate-200 text-slate-600"
                                }`}
                              >
                                {q.required ? "必須" : "任意"}
                              </button>
                              <label className="text-xs text-slate-600">
                                答え方
                                <select
                                  value={q.kind}
                                  disabled={locked}
                                  onChange={(e) => update(q.id, { kind: e.target.value as PresurveyKind })}
                                  data-presurvey-kind
                                  className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white disabled:opacity-60"
                                >
                                  {PRESURVEY_KINDS.map((k) => (
                                    <option key={k.value} value={k.value}>
                                      {k.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-slate-600">
                                出す場所
                                <select
                                  value={q.slot}
                                  onChange={(e) => update(q.id, { slot: e.target.value as PresurveySlot })}
                                  className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                                >
                                  {PRESURVEY_SLOTS.map((sl) => (
                                    <option key={sl.value} value={sl.value}>
                                      {sl.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {!locked && (
                                <label className="text-xs text-slate-600">
                                  入る部
                                  <select
                                    value={q.part}
                                    onChange={(e) =>
                                      update(q.id, { part: Number(e.target.value) as PresurveyPart })
                                    }
                                    className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                                  >
                                    {PRESURVEY_PARTS.map((p) => (
                                      <option key={p.value} value={p.value}>
                                        {p.title}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <button
                                type="button"
                                onClick={() => !locked && update(q.id, { hidden: !q.hidden || undefined })}
                                disabled={locked}
                                data-presurvey-hide
                                className={`text-xs px-2.5 py-1 border rounded-full disabled:opacity-60 ${
                                  q.hidden
                                    ? "border-teal-200 text-teal-700 hover:bg-teal-50 bg-white"
                                    : "border-slate-200 text-slate-600 hover:bg-white"
                                }`}
                              >
                                {q.hidden ? "表示に戻す" : "非表示"}
                              </button>
                            </div>

                            <div className="ml-10 space-y-2">
                              {q.kind !== "text" && (
                                <label className="block text-xs text-slate-600">
                                  選択肢（「／」で区切る）
                                  <Input
                                    value={q.choices.join("／")}
                                    disabled={locked}
                                    onChange={(e) =>
                                      update(q.id, {
                                        choices: e.target.value
                                          .split(/[／/]/)
                                          .map((c) => c.trim())
                                          .filter((c) => !!c),
                                      })
                                    }
                                    className="h-8 text-sm bg-white mt-0.5"
                                    placeholder="例: できた／一部できた／まだ"
                                  />
                                </label>
                              )}
                              <label className="block text-xs text-slate-600">
                                記述欄のラベル（空にすると記述欄を出さない）
                                <Input
                                  value={q.followUpLabel}
                                  onChange={(e) => update(q.id, { followUpLabel: e.target.value })}
                                  className="h-8 text-sm bg-white mt-0.5"
                                  placeholder="例: その理由"
                                />
                              </label>
                              <label className="block text-xs text-slate-600">
                                コーポレートブックのヒント（問いの下に出る）
                                <textarea
                                  value={q.bookHint}
                                  onChange={(e) => update(q.id, { bookHint: e.target.value })}
                                  rows={2}
                                  data-presurvey-bookhint
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white mt-0.5 resize-y"
                                />
                              </label>
                              <label className="block text-xs text-slate-600">
                                ヒントの出典（小さく添える）
                                <Input
                                  value={q.bookSource}
                                  onChange={(e) => update(q.id, { bookSource: e.target.value })}
                                  className="h-8 text-sm bg-white mt-0.5"
                                  placeholder="例: フィロソフィー③"
                                />
                              </label>
                              <label className="block text-xs text-slate-600">
                                添え書き（問いを広げる一言）
                                <Input
                                  value={q.hint}
                                  onChange={(e) => update(q.id, { hint: e.target.value })}
                                  className="h-8 text-sm bg-white mt-0.5"
                                />
                              </label>
                              <label className="block text-xs text-slate-600">
                                常時表示の注記（情報として伝える文・強く迫る言い回しにしない）
                                <Input
                                  value={q.note}
                                  onChange={(e) => update(q.id, { note: e.target.value })}
                                  className="h-8 text-sm bg-white mt-0.5"
                                />
                              </label>
                              <label className="block text-xs text-slate-600">
                                リードマネジメントでの役割（スタッフの画面に小さく出る）
                                <Input
                                  value={q.role}
                                  onChange={(e) => update(q.id, { role: e.target.value })}
                                  className="h-8 text-sm bg-white mt-0.5"
                                  placeholder="例: 自己評価"
                                />
                              </label>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {/* 追加 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <select
                value={newPart}
                onChange={(e) => setNewPart(Number(e.target.value) as PresurveyPart)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white h-8"
              >
                {PRESURVEY_PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.title}
                  </option>
                ))}
              </select>
              <Input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="新しい質問文"
                className="h-8 text-sm flex-1 min-w-[12rem]"
              />
              <Button type="button" variant="outline" onClick={add}>
                ＋ 追加
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={resetToDefault}>
                初期の2部構成に戻す
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "💾 保存"}
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        ※ 保存済みの回答には「回答した時点の質問文」が一緒に入っています。質問を直しても、過去の回答の見え方は変わりません。
        2部構成より前（197の9問）の回答は、そのままの形で表示されます。
      </p>
    </div>
  );
}

// 204 §5: 回答を読める人の説明と、閲覧権を整理した件数（数だけ・本文や氏名は出さない）
function PresurveyAccessNote() {
  const [audit, setAudit] = useState<{ total: number; withPartner: number; revoked: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/admin/presurvey-audit", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setAudit(j))
      .catch(() => setFailed(true));
  }, []);
  return (
    <div className="text-xs text-slate-600 mt-2 bg-white border border-slate-200 rounded-lg px-3 py-2 space-y-1" data-presurvey-access>
      <p>
        回答は、<strong>育成カルテで登録した「次回1on1の予定」</strong>からだけ答えられます（スタッフは日付や相手を選べません）。
        読めるのは<strong>本人・院長・院長が指定した管理者</strong>だけです。指定した管理者は
        「📝 1on1の事前アンケートの回答」の委任と、そのスタッフの担当指定の<strong>両方</strong>がそろって初めて読めます
        （<strong>1on1の相手であっても、指定されていなければ読めません</strong>）。
      </p>
      {audit && (
        <p data-presurvey-audit>
          これまでの回答 {audit.total}件のうち、相手として記録されている人が新しい決まりでは読めない
          <strong> {audit.revoked}件</strong>があります（回答は本人と院長が読めるまま残しています）。
        </p>
      )}
      {failed && <p className="text-slate-400">閲覧権の整理の件数を読み込めませんでした。</p>}
    </div>
  );
}

// 204 §6: 知らせの時期と、メールの見本
function AlertNote() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const send = async () => {
    setBusy(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/presurvey-sample-mail", {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        reason?: string;
        detail?: string;
        to?: string;
      };
      if (j.sent) setResult(`見本を ${j.to} に送りました。`);
      else if (j.reason === "smtp_not_configured")
        setResult(
          "メールの送信設定（RESEND_API_KEY）がまだありません。指示書178の設定が済むと送れます。"
        );
      else setResult(`送れませんでした（${j.reason ?? "原因不明"}${j.detail ? `: ${j.detail}` : ""}）`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="text-xs text-slate-600 mt-2 bg-white border border-slate-200 rounded-lg px-3 py-2 space-y-1.5" data-presurvey-alert-note>
      <p>
        提出の知らせは<strong>提出期限（1on1の3日前）を基準に{" "}
        {PRESURVEY_ALERT_STAGES.map((s) => s.label).join("・")}</strong>の{PRESURVEY_ALERT_HOUR_JST}時（日本時間）に出ます。
        提出したら、その後は出ません。アプリ内は必ず出ます。
      </p>
      <p>
        メールは管理画面「⚙ 機能」の<strong>「1on1の知らせ（事前アンケート・予定）をメールでも送る」</strong>をONにしたときだけ送られます
        （既定はOFF）。<strong>検証用アカウントには送りません。</strong>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={send} disabled={busy} data-presurvey-sample-mail>
          {busy ? "送信中..." : "✉️ 見本を自分あてに1通送る"}
        </Button>
        {result && <span className="text-slate-700">{result}</span>}
      </div>
    </div>
  );
}
