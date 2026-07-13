"use client";

// タスクカテゴリ管理（指示書53）
// 「みんなのタスク」のカテゴリ選択肢を追加・改名・並び替え・非表示できる。
// 定義は content_store `task_category_config`。削除は置かず非表示運用
// （使用中タスクの表示は taskCategoryLabel が id をそのまま返すので壊れない）。

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_TASK_CATEGORIES,
  loadTaskCategories,
  saveTaskCategories,
  type TaskCategoryDef,
} from "@/lib/staff-tasks";

// 追加カテゴリのid自動生成（既定カテゴリのid=ラベル文字列とは衝突しない接頭辞つき）
function generateCategoryId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `tc_${rnd}`;
}

export default function TaskCategoriesAdminPage() {
  const [cats, setCats] = useState<TaskCategoryDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadTaskCategories()
      .then(setCats)
      .catch(() => setCats(DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c }))))
      .finally(() => setLoaded(true));
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 3000);
  };

  const update = (id: string, patch: Partial<TaskCategoryDef>) =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const move = (index: number, dir: -1 | 1) =>
    setCats((cs) => {
      const to = index + dir;
      if (to < 0 || to >= cs.length) return cs;
      const next = [...cs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const add = () => {
    const label = newLabel.trim();
    if (!label) {
      setError("カテゴリ名を入力してください");
      return;
    }
    setCats((cs) => [
      ...cs,
      { id: generateCategoryId(), label, order: cs.length + 1 },
    ]);
    setNewLabel("");
    setError("");
  };

  const resetToDefault = () => {
    if (
      !confirm(
        "カテゴリを既定セット（6件）に戻しますか？\n（追加したカテゴリは一覧から消えますが、タスクのカテゴリ値は残ります。保存ボタンを押すまで確定しません）"
      )
    ) {
      return;
    }
    setCats(DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c })));
  };

  const handleSave = async () => {
    if (cats.some((c) => !c.label.trim())) {
      setError("ラベルが空のカテゴリがあります");
      return;
    }
    setSaving(true);
    setError("");
    const ok = await saveTaskCategories(cats);
    setSaving(false);
    if (!ok) {
      setError("保存に失敗しました");
      return;
    }
    flash("💾 カテゴリを保存しました（みんなのタスクに反映されます）");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          🏷️ タスクカテゴリ管理
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          「みんなのタスク」のカテゴリ選択肢を編集します。使用中のカテゴリは非表示にすると選択肢から消えますが、既存タスクの表示は維持されます。
        </p>
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
            <ul className="space-y-1">
              {cats.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5 ${
                    c.hidden ? "bg-slate-100 opacity-60" : "bg-slate-50"
                  }`}
                >
                  <Input
                    value={c.label}
                    onChange={(e) => update(c.id, { label: e.target.value })}
                    className="h-8 text-sm flex-1 min-w-[140px]"
                  />
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
                    disabled={i === cats.length - 1}
                    className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      update(c.id, { hidden: !c.hidden || undefined })
                    }
                    className={`text-xs px-2 py-1 border rounded ${
                      c.hidden
                        ? "border-teal-200 text-teal-700 hover:bg-teal-50"
                        : "border-slate-200 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {c.hidden ? "表示に戻す" : "非表示"}
                  </button>
                </li>
              ))}
            </ul>

            {/* 追加 */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="新しいカテゴリ名（例：清掃・広報）"
                className="h-8 text-sm flex-1"
              />
              <Button type="button" variant="outline" onClick={add}>
                ＋ 追加
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={resetToDefault}>
                既定の6件に戻す
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "💾 保存"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
