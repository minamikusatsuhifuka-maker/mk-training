"use client";

// 書類進捗ボードの設定（指示書157-A）— 管理画面側の入れ物
// ページ（server component）で管理者チェック済み。ここは読み込みと体裁だけを持つ。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchDocTasksConfig, type DocTasksConfig } from "@/lib/doc-tasks";
import { DocTasksSettings } from "@/components/DocTasksSettings";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

export function DocTasksAdminPanel() {
  const [config, setConfig] = useState<DocTasksConfig | null>(null);
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [cfg, idx] = await Promise.all([
        fetchDocTasksConfig(),
        loadProfilesIndex(),
      ]);
      setConfig(cfg);
      setMembers(idx);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  // 初回の読み込み（設定と名簿の取得）。状態を入れるのは通信の完了後で、レンダー中には呼ばれない
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 通信完了後にのみ状態を更新する初回ロード
    void load();
  }, [load]);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">
          📋 書類進捗ボードの設定
        </h1>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          誰がボードを開けるか・滞留とみなす日数・主治医の選択肢・アラートの送信先をここで設定します。
          スタッフが使う画面（
          <Link href="/doc-tasks" className="text-teal-700 underline underline-offset-2">
            書類進捗ボード
          </Link>
          ）は記録と確認だけの画面です。
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

      {config ? (
        <DocTasksSettings
          config={config}
          members={members}
          alwaysOpen
          onSaved={(next) => {
            setConfig(next);
            setMsg("💾 設定を保存しました");
          }}
          onError={setError}
        />
      ) : (
        !error && <p className="text-xs text-gray-500">読み込み中…</p>
      )}
    </div>
  );
}
