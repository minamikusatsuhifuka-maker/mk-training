"use client";

// ホーム「今週の質問」セクション（指示書46-A/47）
// - 質問の表示・回答の投稿/編集/削除（1人=週1件、id=userId/匿名IDで判定）
// - 回答への 👍🙏 リアクション（トグル）
// - 管理者は質問文をこの場で編集（保存時に questionByWeek へも記録）
// - portal_features.weeklyQuestion が OFF なら丸ごと非表示
// - 「📚 過去の質問をみる」→ /weekly-questions（アーカイブ）

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminOnly } from "@/components/AdminOnly";
import {
  getReactorIdentity,
  NEWS_AUTHOR_LS_KEY,
  type Reactor,
} from "@/lib/news-reactions";
import { loadPortalFeatures } from "@/lib/portal-features";
import {
  currentWeekKey,
  hasWeeklyReacted,
  loadWeeklyQuestions,
  removeWeeklyAnswer,
  saveWeeklyQuestions,
  setWeeklyReaction,
  upsertWeeklyAnswer,
  weeklyReactionCount,
  weekRangeLabel,
  withQuestionRecorded,
  WEEKLY_REACTION_META,
  type WeeklyQuestionsData,
} from "@/lib/weekly-questions";

// メールアドレスのままの名前は @ 前だけ表示（/members と同じ方針）
function shortName(name: string | null): string {
  if (!name || !name.trim()) return "匿名";
  return name.includes("@") ? name.split("@")[0] : name;
}

export function WeeklyQuestionSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null=読込中
  const [data, setData] = useState<WeeklyQuestionsData | null>(null);
  const [reactor, setReactor] = useState<Reactor | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState(""); // 匿名時のみ編集可
  const [editing, setEditing] = useState(false); // 自分の回答の編集中
  const [saving, setSaving] = useState(false);

  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);

  const weekKey = currentWeekKey();

  useEffect(() => {
    loadPortalFeatures()
      .then((f) => {
        setEnabled(f.weeklyQuestion);
        if (!f.weeklyQuestion) return;
        // 有効時のみデータとidentityを読み込む
        loadWeeklyQuestions()
          .then((d) => {
            setData(d);
            // 今週の質問文をアーカイブ用に記録（差分がある時だけ保存）
            const recorded = withQuestionRecorded(d);
            if (recorded) {
              saveWeeklyQuestions(recorded)
                .then((ok) => ok && setData(recorded))
                .catch(() => {});
            }
          })
          .catch(() => {});
        getReactorIdentity()
          .then(({ reactor: r, loggedIn: li }) => {
            setReactor(r);
            setLoggedIn(li);
            if (!li) {
              try {
                setAuthorName(
                  localStorage.getItem(NEWS_AUTHOR_LS_KEY)?.trim() ?? ""
                );
              } catch {
                /* ignore */
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled || !data) return null;

  const question = (data.questionByWeek[weekKey] ?? data.question).trim();
  const answers = data.answers[weekKey] ?? [];
  const myAnswer = reactor ? answers.find((a) => a.id === reactor.id) : undefined;

  // 最新データを読み直してから変更を適用・保存する（他端末の更新を上書きしない）
  const applyAndSave = async (
    mutate: (fresh: WeeklyQuestionsData) => WeeklyQuestionsData
  ): Promise<boolean> => {
    const fresh = await loadWeeklyQuestions().catch(() => null);
    if (!fresh) return false;
    const next = mutate(fresh);
    const ok = await saveWeeklyQuestions(next);
    if (ok) setData(next);
    return ok;
  };

  const submitAnswer = async () => {
    if (!reactor || !text.trim() || saving) return;
    setSaving(true);
    const name = loggedIn
      ? (reactor.name ?? "")
      : authorName.trim();
    if (!loggedIn) {
      try {
        if (name) localStorage.setItem(NEWS_AUTHOR_LS_KEY, name);
      } catch {
        /* ignore */
      }
    }
    const ok = await applyAndSave((fresh) =>
      upsertWeeklyAnswer(fresh, weekKey, {
        id: reactor.id,
        name,
        text: text.trim(),
        at: new Date().toISOString(),
      })
    );
    setSaving(false);
    if (ok) {
      setText("");
      setEditing(false);
    }
  };

  const deleteMyAnswer = async () => {
    if (!reactor || saving) return;
    if (!confirm("自分の回答を削除しますか？")) return;
    setSaving(true);
    await applyAndSave((fresh) => removeWeeklyAnswer(fresh, weekKey, reactor.id));
    setSaving(false);
    setEditing(false);
    setText("");
  };

  const toggleReaction = async (
    answerId: string,
    key: (typeof WEEKLY_REACTION_META)[number]["key"]
  ) => {
    if (!reactor) return;
    const active = !hasWeeklyReacted(data, weekKey, answerId, key, reactor.id);
    await applyAndSave((fresh) =>
      setWeeklyReaction(fresh, weekKey, answerId, key, reactor, active)
    );
  };

  const saveQuestion = async () => {
    const q = questionDraft.trim();
    if (savingQuestion) return;
    setSavingQuestion(true);
    const ok = await applyAndSave((fresh) => ({
      ...fresh,
      question: q,
      questionByWeek: q
        ? { ...fresh.questionByWeek, [weekKey]: q }
        : fresh.questionByWeek,
    }));
    setSavingQuestion(false);
    if (ok) setEditingQuestion(false);
  };

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          今週の質問
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {weekRangeLabel(weekKey)}
          </span>
          <AdminOnly>
            <button
              type="button"
              onClick={() => {
                setQuestionDraft(question);
                setEditingQuestion(true);
              }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ✏️ 質問を編集
            </button>
          </AdminOnly>
          <Link
            href="/weekly-questions"
            className="text-xs px-2.5 py-1 rounded-full border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
          >
            📚 過去の質問をみる
          </Link>
        </div>
      </div>

      {/* 質問（管理者は編集可） */}
      {editingQuestion ? (
        <div className="p-4 bg-violet-50 rounded-xl border border-violet-100 space-y-2">
          <input
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
            placeholder="例：最近ハマっている食べ物は？"
            className="w-full h-9 rounded-md border border-violet-200 bg-white px-3 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditingQuestion(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={saveQuestion}
              disabled={savingQuestion}
              className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {savingQuestion ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      ) : question ? (
        <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
          <p className="text-sm text-violet-900 leading-relaxed font-medium">
            ❓ {question}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          今週の質問はまだ設定されていません。
        </p>
      )}

      {/* 回答一覧 */}
      {answers.length > 0 && (
        <ul className="mt-3 space-y-2">
          {answers.map((a) => (
            <li
              key={a.id}
              className="p-3 rounded-xl bg-white border border-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 whitespace-pre-wrap min-w-0 flex-1">
                  {a.text}
                </p>
                {reactor && a.id === reactor.id && !editing && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setText(a.text);
                        setEditing(true);
                      }}
                      className="text-[11px] px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-50"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={deleteMyAnswer}
                      className="text-[11px] px-2 py-0.5 border border-red-200 rounded text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-gray-500">
                  👤 {shortName(a.name)}
                </span>
                <span className="flex-1" />
                {WEEKLY_REACTION_META.map((m) => {
                  const count = weeklyReactionCount(data, weekKey, a.id, m.key);
                  const mine = reactor
                    ? hasWeeklyReacted(data, weekKey, a.id, m.key, reactor.id)
                    : false;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleReaction(a.id, m.key)}
                      title={m.label}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        mine
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {m.emoji}
                      {count > 0 && (
                        <span className="ml-0.5 tabular-nums">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 回答フォーム（未回答 or 編集中のみ。質問が未設定なら出さない） */}
      {question && reactor && (!myAnswer || editing) && (
        <div className="mt-3 space-y-2">
          {!loggedIn && (
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="名前（空欄=匿名）"
              className="w-full max-w-[240px] h-8 rounded-md border border-gray-200 bg-white px-2.5 text-xs"
            />
          )}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editing ? "回答を編集..." : "ひと言で回答..."}
              className="flex-1 h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitAnswer();
                }
              }}
            />
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText("");
                }}
                className="text-xs px-3 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                キャンセル
              </button>
            )}
            <button
              type="button"
              onClick={submitAnswer}
              disabled={saving || !text.trim()}
              className="text-xs px-3.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "送信中..." : editing ? "保存" : "回答する"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
