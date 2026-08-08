"use client";

// 書類進捗ボードの設定（指示書154 / 154-2・**管理者のみ**表示）
//   - このボードを開ける人（未設定＝管理者のみ＝安全側）
//   - アラートを受け取る人（未指名＝開ける人ぜんいん）
//   - 滞留とみなす日数（種別ごと・既定2日）
//   - 主治医の選択肢
//
// メール通知は現時点で未接続（既存の招待メールは Supabase Auth の招待専用で、
// 任意の本文・任意の宛先には送れないため）。接続には新しい送信サービスの追加が必要で、
// 指示書134の停止条件（新規APIキー・課金・環境変数）に当たるので院長判断待ち。

import { useState } from "react";
import {
  DOC_TYPES,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  saveDocTasksConfig,
  type DocTasksConfig,
  type DocTypeId,
} from "@/lib/doc-tasks";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

export function DocTasksSettings({
  config,
  members,
  onSaved,
  onError,
}: {
  config: DocTasksConfig;
  members: StaffProfileIndexEntry[];
  onSaved: (next: DocTasksConfig) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewers, setViewers] = useState<string[]>(config.viewerUserIds);
  const [notifiees, setNotifiees] = useState<string[]>(config.notifyUserIds);
  const [thresholds, setThresholds] = useState<Record<DocTypeId, number>>(
    config.thresholdDays
  );
  const [doctors, setDoctors] = useState(config.doctors.join("\n"));

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    userId: string,
    checked: boolean
  ) => setList(checked ? [...list, userId] : list.filter((id) => id !== userId));

  const save = async () => {
    setSaving(true);
    try {
      const next = await saveDocTasksConfig({
        viewerUserIds: viewers,
        notifyUserIds: notifiees,
        thresholdDays: thresholds,
        doctors: doctors
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setViewers(next.viewerUserIds);
      setNotifiees(next.notifyUserIds);
      setThresholds(next.thresholdDays);
      setDoctors(next.doctors.join("\n"));
      onSaved(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-gray-900">
          ⚙️ ボードの設定
          <span className="ml-2 text-xs font-normal text-gray-600">
            {config.viewerUserIds.length
              ? `${config.viewerUserIds.length}人を指名中`
              : "未設定（管理者のみ）"}
          </span>
        </span>
        <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <section>
            <p className="text-xs font-medium text-gray-800">
              🔑 このボードを開ける人
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
              カルテ番号を扱うため、指名した人だけが開けます。
              <strong>未設定のうちは管理者のみ</strong>（安全側）。
              管理者はこの設定を変更できる立場のため、指名の有無にかかわらず開けます。
              保存時はあなた自身が自動的に含まれます。
            </p>
            <MemberChecklist
              members={members}
              selected={viewers}
              onToggle={(id, checked) => toggle(viewers, setViewers, id, checked)}
            />
          </section>

          <section>
            <p className="text-xs font-medium text-gray-800">
              🔔 アラートを受け取る人（アプリ内）
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
              メニューの「書類進捗」に滞留件数のバッジを出します。
              未指名のときは<strong>ボードを開ける人ぜんいん</strong>に出ます。
            </p>
            <MemberChecklist
              members={members.filter(
                (m) => viewers.length === 0 || viewers.includes(m.userId)
              )}
              selected={notifiees}
              onToggle={(id, checked) =>
                toggle(notifiees, setNotifiees, id, checked)
              }
            />
          </section>

          <section>
            <p className="text-xs font-medium text-gray-800">
              ⏰ 滞留とみなす日数（記入日からの経過）
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1.5">
              {DOC_TYPES.map((t) => (
                <label key={t.id} className="text-[11px] text-gray-700">
                  {t.emoji} {t.label}
                  <input
                    type="number"
                    min={THRESHOLD_MIN}
                    max={THRESHOLD_MAX}
                    value={thresholds[t.id]}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        [t.id]: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs font-medium text-gray-800">
              🩺 主治医の選択肢（1行に1名）
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              登録画面の入力候補に出ます。空でも自由入力できます。
            </p>
            <textarea
              value={doctors}
              onChange={(e) => setDoctors(e.target.value)}
              rows={4}
              placeholder={"院長\n非常勤A先生"}
              className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </section>

          <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2 leading-relaxed">
            ✉️ <strong>メール通知は未接続です。</strong>
            既存の招待メールは Supabase の「招待専用」の仕組みで、任意の本文・任意の宛先には送れません。
            メールを飛ばすには新しい送信サービス（＝新しいAPIキー・環境変数）の追加が必要なため、
            指示書134の停止条件に当たると判断していったん止めています。ご判断ください。
          </p>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
          >
            {saving ? "保存中…" : "💾 設定を保存"}
          </button>
        </div>
      )}
    </div>
  );
}

function MemberChecklist({
  members,
  selected,
  onToggle,
}: {
  members: StaffProfileIndexEntry[];
  selected: string[];
  onToggle: (userId: string, checked: boolean) => void;
}) {
  if (members.length === 0) {
    return <p className="text-[11px] text-gray-600 mt-1.5">メンバーがいません。</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1.5">
      {members.map((m) => (
        <label
          key={m.userId}
          className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50"
        >
          <input
            type="checkbox"
            checked={selected.includes(m.userId)}
            onChange={(e) => onToggle(m.userId, e.target.checked)}
          />
          <span className="truncate">{m.name}</span>
          {m.role && <span className="text-xs text-gray-500">{m.role}</span>}
        </label>
      ))}
    </div>
  );
}
