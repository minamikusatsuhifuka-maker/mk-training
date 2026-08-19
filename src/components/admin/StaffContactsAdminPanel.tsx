"use client";

// スタッフ連絡先の設定（指示書169）— 管理画面側の入れ物
// ページ（server component）で管理者チェック済み。ここは読み込みと体裁だけを持つ。
//
// できること: 「誰が連絡先を開けるか」の指名（157の menu_access を流用）と、操作ログの閲覧。
// **編集できる人を増やす設定は無い**（編集は管理者に固定・169-1-3）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchStaffContactsConfig,
  saveStaffContactsConfig,
} from "@/lib/staff-contacts";
import { StaffContactLogsPanel } from "@/components/admin/StaffContactLogsPanel";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

export function StaffContactsAdminPanel() {
  const [viewers, setViewers] = useState<string[]>([]);
  /** 保存済みの指名リスト（名簿に出ないIDを壊さないために保持する） */
  const [saved, setSaved] = useState<string[]>([]);
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [cfg, idx] = await Promise.all([
        fetchStaffContactsConfig(),
        loadProfilesIndex(),
      ]);
      setViewers(cfg.viewerUserIds);
      setSaved(cfg.viewerUserIds);
      setMembers(idx);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (userId: string, checked: boolean) =>
    setViewers((prev) =>
      checked ? [...prev, userId] : prev.filter((id) => id !== userId)
    );

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      // 名簿に出ていないID（無効化されたアカウント等）は画面で操作できないので、
      // 保存時にそのまま残す（157-Bと同じ・保存済みのIDを壊さない）
      const known = new Set(members.map((m) => m.userId));
      const next = [...viewers, ...saved.filter((id) => !known.has(id))];
      const r = await saveStaffContactsConfig(next);
      setViewers(r.viewerUserIds);
      setSaved(r.viewerUserIds);
      setError("");
      setMsg("💾 保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">
          📇 スタッフ連絡先の設定
        </h1>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          誰が連絡先を開けるかをここで指名します。登録・修正・削除は
          <strong>管理者だけ</strong>が行えます（指名された人は閲覧のみ）。
          連絡先そのものは
          <Link
            href="/staff-contacts"
            className="text-teal-700 underline underline-offset-2 mx-1"
          >
            スタッフ連絡先
          </Link>
          の画面で扱います。
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

      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-medium text-gray-800">
          🔑 この連絡先を開ける人
        </p>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          チェックした人と管理者だけが開けます。
          <strong>未設定のうちは管理者のみ</strong>（安全側）。
          保存時はあなた自身が自動的に含まれます。
          <br />
          パスワードでの共有はしていません。誰が開けるかがこの一覧で分かり、
          <strong>退職時にチェックを外せばその場で届かなくなります。</strong>
          <br />
          「全員に公開」の切り替えは<strong>設けていません</strong>
          （住所・電話番号と、ご家族・保証人の情報を含むため）。
        </p>

        {!loaded ? (
          <p className="text-[11px] text-gray-500 mt-2">読み込み中…</p>
        ) : members.length === 0 ? (
          <p className="text-[11px] text-gray-600 mt-2">メンバーがいません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
            {members.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50 min-h-[44px]"
              >
                <input
                  type="checkbox"
                  checked={viewers.includes(m.userId)}
                  onChange={(e) => toggle(m.userId, e.target.checked)}
                />
                <span className="truncate">{m.name}</span>
                {m.role && (
                  <span className="text-xs text-gray-500">{m.role}</span>
                )}
              </label>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || !loaded}
          className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          {saving ? "保存中…" : "💾 設定を保存"}
        </button>
      </section>

      {/* 操作ログ（管理者のみ・時系列一覧） */}
      <StaffContactLogsPanel />
    </div>
  );
}
