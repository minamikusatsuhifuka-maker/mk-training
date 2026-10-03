"use client";

// 📝 1on1の事前アンケートの質問（指示書197・197-補）— 院長のみ
// 質問文・必須/任意・選択肢・注記・補足・置き場所を編集し、並べ替えできる。
// 定義は content_store `one_on_one_presurvey_config`（書き込みは管理者のみ・サーバー側で強制）。
// 削除は置かず非表示運用（過去の回答は回答時点の質問文を持っているので壊れないが、
// 一覧の見え方を安定させるため定義は残す）。
//
// 並びの意味（197-補）: 願望 → 行動 → 自己評価 → 計画・約束。
// 初期の9問に戻すボタンで、指示書197-補の並びに復帰できる。

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRESURVEY_QUESTIONS,
  PRESURVEY_INTRO,
  PRESURVEY_KINDS,
  PRESURVEY_SLOTS,
  genPresurveyQuestionId,
  loadPresurveyQuestions,
  savePresurveyQuestions,
  type PresurveyKind,
  type PresurveyQuestion,
  type PresurveySlot,
} from "@/lib/one-on-one-presurvey";

function defaults(): PresurveyQuestion[] {
  return DEFAULT_PRESURVEY_QUESTIONS.map((q) => ({ ...q, choices: [...q.choices] }));
}

export default function PresurveyAdminPage() {
  const [questions, setQuestions] = useState<PresurveyQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newText, setNewText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPresurveyQuestions()
      .then(setQuestions)
      .catch(() => setQuestions(defaults()))
      .finally(() => setLoaded(true));
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 4000);
  };

  const update = (id: string, patch: Partial<PresurveyQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (index: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const to = index + dir;
      if (to < 0 || to >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[to]] = [next[to], next[index]];
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
        text,
        required: false,
        kind: "text",
        choices: [],
        followUpLabel: "",
        note: "",
        hint: "",
        role: "",
        slot: "top",
      },
    ]);
    setNewText("");
    setError("");
  };

  const resetToDefault = () => {
    if (
      !confirm(
        "質問を初期の9問（指示書197-補）に戻しますか？\n（追加した質問は一覧から消えますが、保存済みの回答は回答時点の質問文を持っているので消えません。保存ボタンを押すまで確定しません）"
      )
    ) {
      return;
    }
    setQuestions(defaults());
  };

  const handleSave = async () => {
    if (questions.some((q) => !q.text.trim())) {
      setError("質問文が空の項目があります");
      return;
    }
    const needChoices = questions.filter(
      (q) => q.kind !== "text" && q.choices.filter((c) => c.trim()).length === 0
    );
    if (needChoices.length > 0) {
      setError(
        `選択肢が必要な質問に選択肢がありません（「${needChoices[0].text}」）`
      );
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
          スタッフが1on1の前に答える質問です。並びは選択理論の面談の流れ（願望 → 行動 → 自己評価 → 計画・約束）。
          回答は1on1画面のRWDEPの各欄の隣に出ます（置き場所は各質問の「出す場所」で決まります）。
        </p>
        <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          スタッフの画面には冒頭に常時こう出ます: 「{PRESURVEY_INTRO}」
        </p>
        <PresurveyAccessNote />
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

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        {!loaded ? (
          <p className="text-sm text-slate-500">読み込み中...</p>
        ) : (
          <>
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className={`rounded-xl border px-3 py-3 space-y-2 ${
                    q.hidden
                      ? "bg-slate-100 border-slate-200 opacity-70"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-slate-500 pt-2 w-6 shrink-0">
                      {i + 1}.
                    </span>
                    <textarea
                      value={q.text}
                      onChange={(e) => update(q.id, { text: e.target.value })}
                      rows={2}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y bg-white"
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === questions.length - 1}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-8">
                    <button
                      type="button"
                      onClick={() => update(q.id, { required: !q.required })}
                      className={`text-xs px-2.5 py-1 border rounded-full ${
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
                        onChange={(e) =>
                          update(q.id, { kind: e.target.value as PresurveyKind })
                        }
                        className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
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
                        onChange={(e) =>
                          update(q.id, { slot: e.target.value as PresurveySlot })
                        }
                        className="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                      >
                        {PRESURVEY_SLOTS.map((sl) => (
                          <option key={sl.value} value={sl.value}>
                            {sl.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => update(q.id, { hidden: !q.hidden || undefined })}
                      className={`text-xs px-2.5 py-1 border rounded-full ${
                        q.hidden
                          ? "border-teal-200 text-teal-700 hover:bg-teal-50 bg-white"
                          : "border-slate-200 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {q.hidden ? "表示に戻す" : "非表示"}
                    </button>
                  </div>

                  <div className="pl-8 space-y-2">
                    {q.kind !== "text" && (
                      <label className="block text-xs text-slate-600">
                        選択肢（「／」で区切る）
                        <Input
                          value={q.choices.join("／")}
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
                        onChange={(e) =>
                          update(q.id, { followUpLabel: e.target.value })
                        }
                        className="h-8 text-sm bg-white mt-0.5"
                        placeholder="例: その理由"
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      補足表示（問いを広げる一言）
                      <Input
                        value={q.hint}
                        onChange={(e) => update(q.id, { hint: e.target.value })}
                        className="h-8 text-sm bg-white mt-0.5"
                        placeholder="例: もし制約がなかったら、どんな姿を描きますか？"
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
              ))}
            </ul>

            {/* 追加 */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
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
                className="h-8 text-sm flex-1"
              />
              <Button type="button" variant="outline" onClick={add}>
                ＋ 追加
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={resetToDefault}>
                初期の9問に戻す
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
      </p>
    </div>
  );
}

// 200: 回答を読める人の説明と、閲覧権を整理した件数（1-4。数だけ・本文や氏名は出さない）
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
        読めるのは<strong>本人・院長・その1on1の担当者</strong>（院長か、院長がそのスタッフの担当に指定した幹部）だけです。
      </p>
      {audit && (
        <p data-presurvey-audit>
          これまでの回答 {audit.total}件のうち、本人が選んだ相手が院長でも担当幹部でもなかった
          <strong> {audit.revoked}件</strong>は、相手が読めないようにしました（回答は本人と院長が読めるまま残しています）。
        </p>
      )}
      {failed && <p className="text-slate-400">閲覧権の整理の件数を読み込めませんでした。</p>}
    </div>
  );
}
