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
  visibleProfileFields,
  type ProfileFieldDef,
  type ProfileFieldType,
} from "@/lib/profile-fields";
import {
  BASIC_CARD_FIELDS,
  DEFAULT_MEMBERS_CARD_CONFIG,
  defaultCardFieldIds,
  loadMembersCardConfigOrNull,
  saveMembersCardConfig,
  type MembersCardConfig,
} from "@/lib/members-card";
import {
  DEFAULT_PROFILE_ROLES,
  ROLE_COLOR_CLASSES,
  ROLE_COLOR_OPTIONS,
  loadProfileRoleConfig,
  saveProfileRoleConfig,
  type ProfileRoleDef,
  type RoleColorName,
} from "@/lib/profile-roles";

// 追加項目のid自動生成（既定項目のidとは衝突しない接頭辞つき）
function generateFieldId(): string {
  return `f_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

// 追加役職のid自動生成（既定役職のid=ラベル文字列とは衝突しない接頭辞つき）
function generateRoleId(): string {
  return `r_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
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

  // メンバー紹介カードの表示項目設定（指示書32）
  const [cardConfig, setCardConfig] = useState<MembersCardConfig>(
    DEFAULT_MEMBERS_CARD_CONFIG
  );
  const [cardSaving, setCardSaving] = useState(false);

  // 役職の選択肢設定（指示書51）
  const [roles, setRoles] = useState<ProfileRoleDef[]>(DEFAULT_PROFILE_ROLES);
  const [roleSaving, setRoleSaving] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleColor, setNewRoleColor] = useState<RoleColorName>("amber");

  useEffect(() => {
    // カード設定が未保存なら「全カスタム項目＋自己紹介・趣味特技」を既定として編集開始
    Promise.all([
      loadProfileFieldConfig(),
      loadMembersCardConfigOrNull(),
      loadProfileRoleConfig(),
    ])
      .then(([defs, cfg, roleDefs]) => {
        setFields(defs);
        setCardConfig(
          cfg ?? {
            ...DEFAULT_MEMBERS_CARD_CONFIG,
            fieldIds: defaultCardFieldIds(
              visibleProfileFields(defs).map((f) => f.id)
            ),
          }
        );
        setRoles(roleDefs);
      })
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

  // ─── カード表示項目 ───
  // 選択肢 = 基本項目 + 現在編集中のカスタム項目（非表示は除く）
  const cardOptions = [
    ...BASIC_CARD_FIELDS,
    ...fields
      .filter((f) => !f.hidden)
      .map((f) => ({ id: f.id, label: f.label })),
  ];

  const toggleCardField = (id: string) => {
    if (cardConfig.fieldIds.includes(id)) {
      setCardConfig((c) => ({
        ...c,
        fieldIds: c.fieldIds.filter((x) => x !== id),
      }));
      return;
    }
    setCardConfig((c) => ({ ...c, fieldIds: [...c.fieldIds, id] }));
  };

  const moveCardField = (index: number, dir: -1 | 1) =>
    setCardConfig((c) => {
      const to = index + dir;
      if (to < 0 || to >= c.fieldIds.length) return c;
      const next = [...c.fieldIds];
      [next[index], next[to]] = [next[to], next[index]];
      return { ...c, fieldIds: next };
    });

  const handleSaveCardConfig = async () => {
    setCardSaving(true);
    setError("");
    const ok = await saveMembersCardConfig(cardConfig);
    setCardSaving(false);
    if (!ok) {
      setError("カード表示設定の保存に失敗しました");
      return;
    }
    flash("💾 メンバー紹介カードの表示項目を保存しました");
  };

  // ─── 役職の選択肢（指示書51） ───
  const updateRole = (id: string, patch: Partial<ProfileRoleDef>) =>
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const moveRole = (index: number, dir: -1 | 1) =>
    setRoles((rs) => {
      const to = index + dir;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const addRole = () => {
    const label = newRoleLabel.trim();
    if (!label) {
      setError("役割（職種）のラベルを入力してください");
      return;
    }
    setRoles((rs) => [
      ...rs,
      {
        id: generateRoleId(),
        label,
        color: newRoleColor,
        order: rs.length + 1,
      },
    ]);
    setNewRoleLabel("");
    setNewRoleColor("amber");
    setError("");
  };

  const resetRolesToDefault = () => {
    if (
      !confirm(
        `役割（職種）を既定セット（${DEFAULT_PROFILE_ROLES.length}件）に戻しますか？\n（追加した役割は一覧から消えますが、メンバーの役割データは残ります。保存ボタンを押すまで確定しません）`
      )
    ) {
      return;
    }
    setRoles(DEFAULT_PROFILE_ROLES.map((r) => ({ ...r })));
  };

  const handleSaveRoles = async () => {
    if (roles.some((r) => !r.label.trim())) {
      setError("ラベルが空の役割（職種）があります");
      return;
    }
    setRoleSaving(true);
    setError("");
    const ok = await saveProfileRoleConfig(roles);
    setRoleSaving(false);
    if (!ok) {
      setError("役割（職種）の選択肢の保存に失敗しました");
      return;
    }
    flash("💾 役割（職種）の選択肢を保存しました（/profile と /members に反映されます）");
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

          {/* メンバー紹介カードの表示項目 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                🃏 メンバー紹介カードの表示項目
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                /members
                の一覧カードに表示する項目と順序を選びます（選択数の上限なし）。選んだ項目のうち、値が入っているものはすべてカードに表示されます。値が空の項目はその人のカードには出ません。
              </p>
            </div>

            {/* 基本表示のON/OFF */}
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { key: "showKana", label: "ふりがな" },
                  { key: "showRole", label: "役割（職種）" },
                  { key: "showMessage", label: "ひとこと" },
                  {
                    key: "showWeeklyAnswers",
                    label: "💬 みんなへの質問の回答（最新2件）を表示",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-1.5 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={cardConfig[opt.key]}
                    onChange={(e) =>
                      setCardConfig((c) => ({
                        ...c,
                        [opt.key]: e.target.checked,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* カードの列数（指示書45） */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">カードの列数</p>
              <select
                value={cardConfig.columns}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCardConfig((c) => ({
                    ...c,
                    columns: v === 3 || v === 4 ? v : 2,
                  }));
                }}
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                <option value={2}>2列</option>
                <option value={3}>3列</option>
                <option value={4}>4列</option>
              </select>
              <p className="text-xs text-slate-500">
                メンバー紹介ページのカード列数（広い画面での最大値）。狭い画面では自動で減ります。
              </p>
            </div>

            {/* 選択中（順序つき） */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">
                選択中の項目（上から順に表示）
              </p>
              {cardConfig.fieldIds.length === 0 ? (
                <p className="text-xs text-slate-500">
                  追加の項目はありません（下から選べます）。
                </p>
              ) : (
                <ul className="space-y-1">
                  {cardConfig.fieldIds.map((id, i) => {
                    const opt = cardOptions.find((o) => o.id === id);
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5"
                      >
                        <span className="text-sm flex-1">
                          {opt?.label ?? `${id}（削除済みの項目）`}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveCardField(i, -1)}
                          disabled={i === 0}
                          className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCardField(i, 1)}
                          disabled={i === cardConfig.fieldIds.length - 1}
                          className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCardField(id)}
                          className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                        >
                          外す
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 未選択の選択肢 */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">追加できる項目</p>
              <div className="flex flex-wrap gap-2">
                {cardOptions
                  .filter((o) => !cardConfig.fieldIds.includes(o.id))
                  .map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleCardField(o.id)}
                      className="text-xs px-2.5 py-1 border border-slate-200 rounded-full hover:bg-slate-50"
                    >
                      ＋ {o.label}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveCardConfig}
                disabled={cardSaving}
              >
                {cardSaving ? "保存中..." : "💾 カード表示設定を保存"}
              </Button>
            </div>
          </div>

          {/* 役職の選択肢（指示書51） */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                👔 役割（職種）の選択肢
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                /profile
                の役割（職種）セレクトの選択肢と、メンバー紹介カードのロールカラーを編集します。使用中の役割は非表示にすると選択肢から消えますが、既存メンバーの表示は維持されます。
              </p>
            </div>

            <ul className="space-y-1">
              {roles.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5 ${
                    r.hidden ? "bg-slate-100 opacity-60" : "bg-slate-50"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full shrink-0 ${ROLE_COLOR_CLASSES[r.color].swatch}`}
                    title={r.color}
                  />
                  <Input
                    value={r.label}
                    onChange={(e) => updateRole(r.id, { label: e.target.value })}
                    className="h-8 text-sm flex-1 min-w-[140px]"
                  />
                  <select
                    value={r.color}
                    onChange={(e) =>
                      updateRole(r.id, {
                        color: e.target.value as RoleColorName,
                      })
                    }
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                  >
                    {ROLE_COLOR_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => moveRole(i, -1)}
                    disabled={i === 0}
                    className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRole(i, 1)}
                    disabled={i === roles.length - 1}
                    className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRole(r.id, { hidden: !r.hidden || undefined })}
                    className={`text-xs px-2 py-1 border rounded ${
                      r.hidden
                        ? "border-teal-200 text-teal-700 hover:bg-teal-50"
                        : "border-slate-200 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {r.hidden ? "表示に戻す" : "非表示"}
                  </button>
                </li>
              ))}
            </ul>

            {/* 追加 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Input
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                placeholder="新しい役割名（例：マルチタスク医療事務・医師）"
                className="h-8 text-sm flex-1 min-w-[180px]"
              />
              <select
                value={newRoleColor}
                onChange={(e) =>
                  setNewRoleColor(e.target.value as RoleColorName)
                }
                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                {ROLE_COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span
                className={`h-4 w-4 rounded-full shrink-0 ${ROLE_COLOR_CLASSES[newRoleColor].swatch}`}
              />
              <Button type="button" variant="outline" onClick={addRole}>
                ＋ 追加
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={resetRolesToDefault}>
                既定の{DEFAULT_PROFILE_ROLES.length}件に戻す
              </Button>
              <Button
                type="button"
                onClick={handleSaveRoles}
                disabled={roleSaving}
              >
                {roleSaving ? "保存中..." : "💾 役割（職種）の選択肢を保存"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
