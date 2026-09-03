"use client";

// 「大切にしている価値観」の語の管理（指示書172）— /admin/profile-fields に設置・**管理者のみ**
//
// できること: 語の追加・表記の編集・削除・並び替え（148の DragSortList＝タッチ対応）・選べる個数の変更。
// 保存は 💾 を押すまで確定しない（148/166と同じ流儀）。保存先は /api/admin/value-keywords。
//
// 【壊さないための約束（172-3）】
// - 表記を直しても識別子（id）は変えない → 選択済みの人の設定は壊れない
// - 削除する前に「この語は◯名が選択中です」を出す。削除しても選択済みの表示は消えない（サーバーが退避する）
// - 追加の語は id を新規発行（vk_N）。既定52語は id＝表記の文字列（既存データとの互換）
//
// 【操作ログ】誰がいつどの語を追加・編集・削除したかを残し、管理者だけが見る（159と同じ線。集計・順位付けは作らない）。

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DragSortList } from "@/components/admin/DragSortList";
import {
  VALUE_KEYWORDS,
  VALUE_KEYWORDS_LIMIT_MAX,
  VALUE_KEYWORDS_LIMIT_MIN,
  VALUE_KEYWORD_LABEL_MAX,
  cleanValueKeywordLabel,
  defaultValueKeywordsConfig,
  fetchValueKeywordLogs,
  fetchValueKeywordsAdmin,
  newValueKeywordId,
  saveValueKeywordsAdmin,
  type RetiredValueKeyword,
  type ValueKeywordDef,
  type ValueKeywordLog,
  type ValueKeywordsConfig,
} from "@/lib/value-keywords";

function formatAt(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const ACTION_STYLE: Record<string, string> = {
  追加: "bg-teal-50 text-teal-800 border-teal-200",
  編集: "bg-slate-50 text-slate-700 border-slate-200",
  削除: "bg-red-50 text-red-700 border-red-200",
  復元: "bg-teal-50 text-teal-800 border-teal-200",
  並び替え: "bg-slate-50 text-slate-700 border-slate-200",
  個数変更: "bg-amber-50 text-amber-800 border-amber-200",
  既定に戻す: "bg-amber-50 text-amber-800 border-amber-200",
};

function usageText(n: number): string {
  return n > 0 ? `${n}名が選択中` : "選択している人はいません";
}

export function ValueKeywordsAdminPanel() {
  const [loaded, setLoaded] = useState(false);
  const [words, setWords] = useState<ValueKeywordDef[]>([]);
  const [retired, setRetired] = useState<RetiredValueKeyword[]>([]);
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(5);
  const [usage, setUsage] = useState<Record<string, number>>({});
  // 保存済みの一覧（差分の有無・「既定に戻す」判定に使う）
  const [savedConfig, setSavedConfig] = useState<ValueKeywordsConfig | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [logs, setLogs] = useState<ValueKeywordLog[]>([]);
  const [logsError, setLogsError] = useState("");
  const [logsShown, setLogsShown] = useState(30);

  const applyPayload = useCallback(
    (p: { config: ValueKeywordsConfig; usage: Record<string, number> }) => {
      setWords(p.config.words.map((w) => ({ ...w })));
      setRetired(p.config.retired);
      setMin(p.config.min);
      setMax(p.config.max);
      setUsage(p.usage);
      setSavedConfig(p.config);
      setResetPending(false);
    },
    []
  );

  const loadLogs = useCallback(async () => {
    try {
      setLogs(await fetchValueKeywordLogs());
      setLogsError("");
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchValueKeywordsAdmin()
      .then((p) => {
        if (cancelled) return;
        applyPayload(p);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
        setLoaded(true);
      });
    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [applyPayload, loadLogs]);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 4000);
  };

  const updateLabel = (id: string, label: string) =>
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, label } : w)));

  const move = (index: number, dir: -1 | 1) =>
    setWords((ws) => {
      const to = index + dir;
      if (to < 0 || to >= ws.length) return ws;
      const next = [...ws];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const reorder = (from: number, to: number) =>
    setWords((ws) => {
      if (from === to) return ws;
      const next = [...ws];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const addWord = () => {
    const label = cleanValueKeywordLabel(newLabel);
    if (!label) {
      setError("追加する語を入力してください");
      return;
    }
    if (words.some((w) => w.label === label)) {
      setError(`「${label}」はすでに一覧にあります`);
      return;
    }
    // 削除済みに同じ表記があれば、その識別子を復元する（選択済みの人の設定と再びつながる）
    const revived = retired.find((r) => r.label === label);
    const id = revived
      ? revived.id
      : newValueKeywordId({ words, retired, min, max });
    setWords((ws) => [...ws, { id, label }]);
    setNewLabel("");
    setError("");
  };

  const removeWord = (w: ValueKeywordDef) => {
    const n = usage[w.id] ?? 0;
    const ok = confirm(
      `「${w.label}」を一覧から外しますか？\n\n` +
        `この語は ${usageText(n)}。\n` +
        (n > 0
          ? "外しても、選択済みの人の設定と、メンバー紹介での表示は消えません（新しくは選べなくなります）。\n"
          : "") +
        "保存ボタンを押すまで確定しません。"
    );
    if (!ok) return;
    setWords((ws) => ws.filter((x) => x.id !== w.id));
  };

  const restoreWord = (r: RetiredValueKeyword) => {
    if (words.some((w) => w.label === r.label)) {
      setError(`「${r.label}」と同じ表記の語がすでに一覧にあります`);
      return;
    }
    setWords((ws) => [...ws, { id: r.id, label: r.label }]);
    setError("");
  };

  const resetToDefault = () => {
    const ok = confirm(
      `既定の${VALUE_KEYWORDS.length}語（アチーブメントの価値観カード由来）に戻しますか？\n\n` +
        "追加した語は一覧から外れますが、選択済みの人の設定と表示は残ります。\n" +
        "保存ボタンを押すまで確定しません。"
    );
    if (!ok) return;
    const d = defaultValueKeywordsConfig();
    setWords(d.words);
    setMin(d.min);
    setMax(d.max);
    setResetPending(true);
    setError("");
  };

  const handleSave = async () => {
    if (words.length === 0) {
      setError("語を1つ以上残してください（すべて消すのではなく「既定に戻す」を使ってください）");
      return;
    }
    const labels = words.map((w) => cleanValueKeywordLabel(w.label));
    if (labels.some((l) => !l)) {
      setError("表記が空の語があります");
      return;
    }
    const dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) {
      setError(`同じ表記の語が2つあります: ${dup}`);
      return;
    }
    if (min > max) {
      setError("下限は上限以下にしてください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const p = await saveValueKeywordsAdmin({
        words: words.map((w, i) => ({ id: w.id, label: labels[i] })),
        min,
        max,
        ...(resetPending ? { resetToDefault: true } : {}),
      });
      applyPayload(p);
      flash("💾 価値観の語を保存しました（/profile と /members に反映されます）");
      void loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    savedConfig !== null &&
    (JSON.stringify(words) !==
      JSON.stringify(savedConfig.words.map((w) => ({ id: w.id, label: w.label }))) ||
      min !== savedConfig.min ||
      max !== savedConfig.max);

  const removedNow = savedConfig
    ? savedConfig.words.filter((w) => !words.some((x) => x.id === w.id))
    : [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          💎 大切にしている価値観の語
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          /profile
          の「大切にしている価値観」で選べる語を編集します。既定の{VALUE_KEYWORDS.length}
          語はアチーブメントの価値観カードに由来し、CDB・教材と揃った組織の共通言語です。
          変更は管理者だけができ、下の操作ログに記録が残ります。
          <br />
          表記を直しても、語を外しても、
          <strong>スタッフが選択済みの設定は壊れません</strong>
          （内部の識別子は変えず、外した語は表示名を保持したまま退避します）。
        </p>
      </div>

      {(message || error) && (
        <p
          className={`text-sm rounded-md px-3 py-2 border ${
            error
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {error || message}
        </p>
      )}

      {!loaded ? (
        <p className="text-sm text-slate-600">読み込み中...</p>
      ) : (
        <>
          {/* 選べる個数 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span>選べる個数:</span>
            <label className="flex items-center gap-1">
              下限（推奨）
              <Input
                type="number"
                inputMode="numeric"
                min={VALUE_KEYWORDS_LIMIT_MIN}
                max={VALUE_KEYWORDS_LIMIT_MAX}
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
                className="h-8 w-16 text-sm"
              />
            </label>
            <span>〜</span>
            <label className="flex items-center gap-1">
              上限
              <Input
                type="number"
                inputMode="numeric"
                min={VALUE_KEYWORDS_LIMIT_MIN}
                max={VALUE_KEYWORDS_LIMIT_MAX}
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="h-8 w-16 text-sm"
              />
            </label>
            <span className="text-slate-500">
              個（下限は「あとN個選ぶと伝わりやすい」の案内に使う目安で、強制ではありません。上限を下げても、すでに上限より多く選んでいる人の設定は削られません）
            </span>
          </div>

          {/* 一覧（ドラッグ並び替え） */}
          <div>
            <p className="text-xs text-slate-500 mb-1.5">
              一覧（{words.length}語）— ⠿ をつかんで並び替え／表記はその場で編集
            </p>
            <DragSortList
              items={words}
              keyOf={(w) => w.id}
              onReorder={reorder}
              className="space-y-1"
              renderRow={({ item: w, index, dragging, handleProps }) => {
                const n = usage[w.id] ?? 0;
                return (
                  <div
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                      dragging
                        ? "border-teal-400 bg-teal-50 shadow-sm"
                        : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <span
                      {...handleProps}
                      className="px-1 py-2 -my-1 text-slate-500 hover:text-slate-700 select-none text-lg leading-none"
                    >
                      ⠿
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums w-6 text-right">
                      {index + 1}
                    </span>
                    <Input
                      value={w.label}
                      maxLength={VALUE_KEYWORD_LABEL_MAX}
                      onChange={(e) => updateLabel(w.id, e.target.value)}
                      className="h-8 text-sm flex-1 min-w-[120px]"
                      aria-label={`語の表記（${w.label}）`}
                    />
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded border ${
                        n > 0
                          ? "bg-teal-50 text-teal-800 border-teal-200"
                          : "bg-white text-slate-400 border-slate-200"
                      }`}
                      title="この語を選択している人数"
                    >
                      {n > 0 ? `${n}名が選択中` : "未選択"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30 min-h-[32px]"
                        title="上へ"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === words.length - 1}
                        className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30 min-h-[32px]"
                        title="下へ"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWord(w)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50 min-h-[32px]"
                        title="一覧から外す"
                      >
                        🗑 外す
                      </button>
                    </div>
                  </div>
                );
              }}
            />
          </div>

          {/* 追加 */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Input
              value={newLabel}
              maxLength={VALUE_KEYWORD_LABEL_MAX}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWord();
                }
              }}
              placeholder="追加する語（例：協調）"
              className="h-8 text-sm flex-1 min-w-[160px]"
            />
            <Button type="button" variant="outline" onClick={addWord}>
              ＋ 追加
            </Button>
          </div>

          {/* この保存で外れる語の注意 */}
          {removedNow.length > 0 && (
            <p className="text-xs rounded-md px-3 py-2 border bg-amber-50 text-amber-800 border-amber-200">
              保存すると一覧から外れる語:{" "}
              {removedNow
                .map((w) => `${w.label}（${usageText(usage[w.id] ?? 0)}）`)
                .join("、")}
              。選択済みの人の設定と表示は残ります。
            </p>
          )}

          {/* 退避中の語（復元できる） */}
          {retired.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 mb-1.5">
                一覧から外した語（選択済みの人には引き続き表示されています）
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {retired
                  .filter((r) => !words.some((w) => w.id === r.id))
                  .map((r) => (
                    <li
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
                    >
                      <span className="line-through">{r.label}</span>
                      <span className="text-[10px] text-slate-400">
                        {usageText(usage[r.id] ?? 0)}
                      </span>
                      <button
                        type="button"
                        onClick={() => restoreWord(r)}
                        className="text-[11px] text-teal-700 hover:underline"
                      >
                        復元
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={resetToDefault}>
              既定の{VALUE_KEYWORDS.length}語に戻す
            </Button>
            <div className="flex items-center gap-2">
              {dirty && (
                <span className="text-[11px] text-amber-700">未保存の変更があります</span>
              )}
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "💾 価値観の語を保存"}
              </Button>
            </div>
          </div>

          {/* 操作ログ（172-4・管理者のみ。159と同じく時系列だけ） */}
          <section className="border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold text-slate-800">🗂 操作ログ</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              誰がいつ、どの語を追加・編集・削除したかの記録です。
              <strong>管理者だけが見られます</strong>。評価に使う集計・順位付けは設けていません。新しい順に並べるだけです。
            </p>
            {logsError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
                {logsError}
              </p>
            )}
            {logs.length === 0 && !logsError ? (
              <p className="text-[11px] text-slate-500 mt-2">
                まだ記録はありません。ここで保存すると残ります。
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {logs.slice(0, logsShown).map((log) => (
                  <li
                    key={log.id}
                    className="rounded-lg border border-slate-200 p-2 text-[11px] leading-relaxed"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-500 tabular-nums">
                        {formatAt(log.at)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded border ${
                          ACTION_STYLE[log.action] ??
                          "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-slate-800">{log.by}</span>
                      <span className="text-slate-700">
                        {log.action === "編集"
                          ? `${log.before} → ${log.after}`
                          : log.action === "削除"
                            ? log.before
                            : log.after}
                        {log.action === "個数変更" && log.before
                          ? `（変更前 ${log.before}）`
                          : ""}
                      </span>
                      {log.affected !== null && log.affected > 0 && (
                        <span className="text-slate-500">
                          当時 {log.affected}名が選択中
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {logs.length > logsShown && (
              <button
                type="button"
                onClick={() => setLogsShown((n) => n + 30)}
                className="mt-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-full text-xs hover:bg-slate-50 min-h-[36px]"
              >
                もっと古い記録を読む
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
