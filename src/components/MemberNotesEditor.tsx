"use client";

// メンバーノートの編集画面（指示書149）
// メンバー一覧 → 1人を選んでノートを編集。管理者は閲覧できるアカウントも指名できる。
// 画面に到達できている時点でサーバー側の認可は通っている（ここでの出し分けは体裁のみ）。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STRENGTH_HINTS,
  emptyNote,
  isEmptyNote,
  type MemberNote,
} from "@/lib/member-notes";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

type ApiState = {
  notes: MemberNote[];
  viewerUserIds: string[];
  isAdmin: boolean;
  tableMissing: boolean;
};

export function MemberNotesEditor({ isAdmin }: { isAdmin: boolean }) {
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [state, setState] = useState<ApiState | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState<MemberNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [showViewers, setShowViewers] = useState(false);
  const [viewerDraft, setViewerDraft] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [idx, res] = await Promise.all([
        loadProfilesIndex(),
        fetch("/api/member-notes", { credentials: "same-origin" }),
      ]);
      setMembers(idx);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "読み込みに失敗しました");
      setState(json as ApiState);
      setViewerDraft((json as ApiState).viewerUserIds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const noteOf = useCallback(
    (userId: string): MemberNote =>
      state?.notes.find((n) => n.staffUserId === userId) ?? emptyNote(userId),
    [state]
  );

  const select = (userId: string) => {
    setSelected(userId);
    setDraft(noteOf(userId));
    setMsg("");
  };

  const nameOf = useMemo(
    () => (userId: string) =>
      members.find((m) => m.userId === userId)?.name || userId.slice(0, 8),
    [members]
  );

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/member-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setMsg("💾 保存しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    if (
      !confirm(
        `${nameOf(draft.staffUserId)}さんのノートを削除します。\n\n⚠️ この削除は取り消せません（記録は完全に消えます）。よろしいですか？`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/member-notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ staffUserId: draft.staffUserId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "削除に失敗しました");
      setMsg("🗑 削除しました");
      setDraft(emptyNote(draft.staffUserId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const saveViewers = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/member-notes/viewers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ viewerUserIds: viewerDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setMsg("💾 閲覧できる人を保存しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof MemberNote, v: string) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  if (state?.tableMissing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-gray-900">
            📔 メンバーノートの準備がまだ終わっていません
          </p>
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
            データの保存先（テーブル）がまだ作られていません。
            <code className="mx-1">~/Downloads/149_メンバーノート_テーブル作成.sql</code>
            を Supabase の SQL Editor で実行してください。実行後にこのページを再読み込みすると使えるようになります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">📔 メンバーノート</h1>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          指名されたアカウントだけが開けるページです。本人や他のスタッフには表示されません。
          <br />
          ここに書いた誕生日・入職日は<strong>お祝い表示には使われません</strong>
          （お祝いは本人がプロフィールで設定したときだけ動きます）。
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">
          {msg}
        </p>
      )}

      {/* 閲覧できる人（管理者のみ） */}
      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setShowViewers((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-gray-900">
              🔑 このページを開ける人
              <span className="ml-2 text-xs font-normal text-gray-600">
                {state?.viewerUserIds.length
                  ? `${state.viewerUserIds.length}人を指名中`
                  : "未設定（管理者のみ）"}
              </span>
            </span>
            <span className="text-xs text-gray-500">
              {showViewers ? "▲" : "▼"}
            </span>
          </button>
          {showViewers && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-600">
                指名した人だけが開けます。<strong>未設定のうちは管理者のみ</strong>
                が開けます（安全側）。管理者は設定を変更できる立場のため、指名の有無にかかわらず開けます。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {members.map((m) => (
                  <label
                    key={m.userId}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={viewerDraft.includes(m.userId)}
                      onChange={(e) =>
                        setViewerDraft((prev) =>
                          e.target.checked
                            ? [...prev, m.userId]
                            : prev.filter((id) => id !== m.userId)
                        )
                      }
                    />
                    <span className="truncate">{m.name}</span>
                    {m.role && (
                      <span className="text-xs text-gray-500">{m.role}</span>
                    )}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={saveViewers}
                disabled={saving}
                className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
              >
                💾 閲覧できる人を保存
              </button>
            </div>
          )}
        </div>
      )}

      {/* メンバー一覧 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-medium text-gray-800 mb-2">メンバーを選ぶ</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {members.map((m) => {
            const has = !isEmptyNote(noteOf(m.userId));
            return (
              <button
                type="button"
                key={m.userId}
                onClick={() => select(m.userId)}
                className={`flex items-center justify-between gap-2 p-2.5 border rounded-lg text-left text-sm ${
                  selected === m.userId
                    ? "bg-teal-50 border-teal-300"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="truncate">
                  {m.name}
                  {m.role && (
                    <span className="ml-1.5 text-xs text-gray-500">
                      {m.role}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {has ? "記入あり" : "未記入"}
                </span>
              </button>
            );
          })}
          {members.length === 0 && (
            <p className="text-xs text-gray-600">メンバーがまだいません。</p>
          )}
        </div>
      </div>

      {/* ノート編集 */}
      {draft && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            {nameOf(draft.staffUserId)} さんのノート
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">誕生日</label>
              <input
                type="date"
                value={draft.birthday}
                onChange={(e) => setField("birthday", e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">入職日</label>
              <input
                type="date"
                value={draft.joinedOn}
                onChange={(e) => setField("joinedOn", e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">
              強みの記録
            </label>
            <p className="text-[11px] text-gray-500 mb-1">
              書き方の目安（自由記述でかまいません）:{" "}
              {STRENGTH_HINTS.map((h) => `${h.key}=${h.hint}`).join(" ／ ")}
            </p>
            <textarea
              value={draft.strengths}
              onChange={(e) => setField("strengths", e.target.value)}
              rows={8}
              placeholder={STRENGTH_HINTS.map((h) => `【${h.key}】`).join("\n\n")}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm leading-relaxed"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">メモ</label>
            <textarea
              value={draft.memo}
              onChange={(e) => setField("memo", e.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm leading-relaxed"
            />
          </div>

          {draft.updatedAt && (
            <p className="text-[11px] text-gray-500">
              最終更新: {draft.updatedAt.slice(0, 16).replace("T", " ")}
              {draft.updatedBy && `（${draft.updatedBy}）`}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
            >
              {saving ? "保存中…" : "💾 保存"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving || isEmptyNote(noteOf(draft.staffUserId))}
              className="px-4 py-2 border border-red-200 text-red-700 rounded-full text-sm hover:bg-red-50 disabled:opacity-40 min-h-[40px]"
            >
              🗑 このノートを削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
