"use client";

// プロフィール項目管理（指示書31）
// /profile の「もっと自己紹介」に表示する項目（質問）を追加・編集・並び替え・
// 非表示・削除できる。定義は content_store `profile_field_config` に保存。
// 項目を削除・非表示にしても、スタッフの回答データ（staff_profile:<userId> の
// customFields）は消えない（同じidで再表示すれば戻る）。

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PROFILE_FIELDS,
  loadProfileFieldConfig,
  saveProfileFieldConfig,
  type ProfileFieldDef,
  type ProfileFieldType,
} from "@/lib/profile-fields";

// 追加項目のid自動生成（既定項目のidとは衝突しない接頭辞つき）
function generateFieldId(): string {
  return `f_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export default function ProfileFieldsAdminPage() {
  const [fields, setFields] = useState<ProfileFieldDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newPlaceholder, setNewPlaceholder] = useState("");
  const [newType, setNewType] = useState<ProfileFieldType>("text");

  useEffect(() => {
    loadProfileFieldConfig()
      .then(setFields)
      .catch(() => setFields(DEFAULT_PROFILE_FIELDS))
      .finally(() => setLoaded(true));
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setError("");
    setTimeout(() => setMessage(""), 3000);
  };

  const update = (id: string, patch: Partial<ProfileFieldDef>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const move = (index: number, dir: -1 | 1) =>
    setFields((fs) => {
      const to = index + dir;
      if (to < 0 || to >= fs.length) return fs;
      const next = [...fs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const remove = (f: ProfileFieldDef) => {
    if (
      !confirm(
        `「${f.label}」を削除しますか？\n（スタッフが入力済みの回答データは消えません。同じ項目を戻せば再表示されます）`
      )
    ) {
      return;
    }
    setFields((fs) => fs.filter((x) => x.id !== f.id));
  };

  const addField = () => {
    const label = newLabel.trim();
    if (!label) {
      setError("項目のラベルを入力してください");
      return;
    }
    setFields((fs) => [
      ...fs,
      {
        id: generateFieldId(),
        label,
        placeholder: newPlaceholder.trim() || undefined,
        type: newType,
        order: fs.length + 1,
      },
    ]);
    setNewLabel("");
    setNewPlaceholder("");
    setNewType("text");
    setError("");
  };

  const resetToDefault = () => {
    if (
      !confirm(
        "項目を既定セット（10項目）に戻しますか？\n（追加した項目は一覧から消えますが、回答データは残ります。保存ボタンを押すまで確定しません）"
      )
    ) {
      return;
    }
    setFields(DEFAULT_PROFILE_FIELDS.map((f) => ({ ...f })));
  };

  const handleSave = async () => {
    if (fields.length === 0) {
      setError("項目が0件です。最低1つは残すか、既定セットに戻してください");
      return;
    }
    if (fields.some((f) => !f.label.trim())) {
      setError("ラベルが空の項目があります");
      return;
    }
    setSaving(true);
    setError("");
    const ok = await saveProfileFieldConfig(fields);
    setSaving(false);
    if (!ok) {
      setError("保存に失敗しました");
      return;
    }
    flash("💾 プロフィール項目を保存しました（/profile と /members に反映されます）");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          🪪 プロフィール項目管理
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          スタッフの /profile
          「もっと自己紹介」に表示する項目（質問）を編集します。項目を削除・非表示にしても、入力済みの回答データは消えません。
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
          {/* 項目一覧 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              項目一覧（{fields.length}）
            </h2>
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <li
                  key={f.id}
                  className={`rounded-xl border px-4 py-3 space-y-2 ${
                    f.hidden
                      ? "border-slate-200 bg-slate-100/70 opacity-70"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-0.5">
                        ラベル（質問）
                      </p>
                      <Input
                        value={f.label}
                        onChange={(e) => update(f.id, { label: e.target.value })}
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-0.5">
                        placeholder（入力例・任意）
                      </p>
                      <Input
                        value={f.placeholder ?? ""}
                        onChange={(e) =>
                          update(f.id, {
                            placeholder: e.target.value || undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={f.type}
                      onChange={(e) =>
                        update(f.id, {
                          type: e.target.value === "textarea" ? "textarea" : "text",
                        })
                      }
                      className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="text">1行テキスト</option>
                      <option value="textarea">複数行テキスト</option>
                    </select>
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
                      disabled={i === fields.length - 1}
                      className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => update(f.id, { hidden: !f.hidden || undefined })}
                      className={`text-xs px-2 py-1 border rounded ${
                        f.hidden
                          ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                          : "border-slate-200 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {f.hidden ? "🙈 非表示中（クリックで表示）" : "👁️ 表示中（クリックで非表示）"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f)}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 ml-auto"
                    >
                      🗑️ 削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 追加フォーム */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">➕ 項目を追加</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="ラベル（例：好きな音楽）"
              />
              <Input
                value={newPlaceholder}
                onChange={(e) => setNewPlaceholder(e.target.value)}
                placeholder="placeholder（例：例：J-POP、K-POP）"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value === "textarea" ? "textarea" : "text")
                }
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="text">1行テキスト</option>
                <option value="textarea">複数行テキスト</option>
              </select>
              <Button type="button" size="sm" onClick={addField}>
                追加
              </Button>
            </div>
          </div>

          {/* 保存・リセット */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={resetToDefault}>
              既定セットに戻す
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "💾 保存"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
