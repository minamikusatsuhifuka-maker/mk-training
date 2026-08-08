"use client";

// 書類進捗ボードの設定（指示書154 / 154-2 / 155・**管理者のみ**表示）
//   - このボードを開ける人（未設定＝管理者のみ＝安全側）
//   - アラートを受け取る人（未指名＝開ける人ぜんいん）
//   - 通知先メールアドレス（155・複数可）＋送信状態の表示とテスト送信
//   - 滞留とみなす日数（種別ごと・既定2日）
//   - 主治医の選択肢

import { useCallback, useEffect, useState } from "react";
import {
  DOC_TYPES,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  fetchDocTasksMailStatus,
  saveDocTasksConfig,
  sendDocTasksTestMail,
  type DocTasksConfig,
  type DocTasksMailStatus,
  type DocTypeId,
} from "@/lib/doc-tasks";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

export function DocTasksSettings({
  config,
  members,
  alwaysOpen,
  onSaved,
  onError,
}: {
  config: DocTasksConfig;
  members: StaffProfileIndexEntry[];
  /** 157: 管理画面では常に開いた状態で置く（折りたたみは使わない） */
  alwaysOpen?: boolean;
  onSaved: (next: DocTasksConfig) => void;
  onError: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const open = alwaysOpen || !collapsed;
  const [saving, setSaving] = useState(false);
  const [viewers, setViewers] = useState<string[]>(config.viewerUserIds);
  const [notifiees, setNotifiees] = useState<string[]>(config.notifyUserIds);
  const [thresholds, setThresholds] = useState<Record<DocTypeId, number>>(
    config.thresholdDays
  );
  const [doctors, setDoctors] = useState(config.doctors.join("\n"));
  const [emails, setEmails] = useState(config.notifyEmails.join("\n"));
  const [mail, setMail] = useState<DocTasksMailStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [mailMsg, setMailMsg] = useState("");

  // メールの状態（APIキーが入っているか・直近の送信結果）は開いたときに取りに行く
  const loadMail = useCallback(async () => {
    try {
      setMail(await fetchDocTasksMailStatus());
    } catch {
      /* 取得できなくても設定画面は使える */
    }
  }, []);

  useEffect(() => {
    if (open && !mail) loadMail();
  }, [open, mail, loadMail]);

  const sendTest = async () => {
    setTesting(true);
    setMailMsg("");
    try {
      const r = await sendDocTasksTestMail();
      const failed =
        r.failedCount > 0
          ? `／⚠️ ${r.failedCount}件は送れませんでした（${r.failures
              .map((f) => `${f.to}: ${f.error}`)
              .join(" ／ ")}）`
          : "";
      setMailMsg(
        `✉️ ${r.sentCount}件の宛先に送信しました（滞留${r.staleCount}件の内容）。受信箱をご確認ください。${failed}`
      );
      await loadMail();
    } catch (e) {
      onError(e instanceof Error ? e.message : "テスト送信に失敗しました");
    } finally {
      setTesting(false);
    }
  };

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    userId: string,
    checked: boolean
  ) => setList(checked ? [...list, userId] : list.filter((id) => id !== userId));

  const save = async () => {
    setSaving(true);
    try {
      const lines = (v: string) =>
        v
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      // 名簿に出ていないID（無効化されたアカウント等）は画面で操作できないので、
      // 保存時にそのまま残す（157-B: 保存済みのIDを壊さない）
      const known = new Set(members.map((m) => m.userId));
      const keepHidden = (list: string[], saved: string[]) => [
        ...list,
        ...saved.filter((id) => !known.has(id)),
      ];
      const next = await saveDocTasksConfig({
        viewerUserIds: keepHidden(viewers, config.viewerUserIds),
        notifyUserIds: keepHidden(notifiees, config.notifyUserIds),
        notifyEmails: lines(emails),
        thresholdDays: thresholds,
        doctors: lines(doctors),
      });
      setViewers(next.viewerUserIds);
      setNotifiees(next.notifyUserIds);
      setThresholds(next.thresholdDays);
      setDoctors(next.doctors.join("\n"));
      // 形式が不正なアドレスはサーバー側で落とされるので、保存後の値で入力欄を上書きする
      setEmails(next.notifyEmails.join("\n"));
      onSaved(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {!alwaysOpen && (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
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
      )}

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

          <section>
            <p className="text-xs font-medium text-gray-800">
              📧 アラートの送信先（1行に1件・複数可）
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
              毎朝8時に、その時点で滞留している件を<strong>1通にまとめて</strong>送ります。
              <strong>本文にカルテ番号・患者様のお名前は入りません</strong>
              （「紹介状お返事 2件が3日以上未完了」までの粒度＋ポータルへのリンク）。
              内容が変わらないまま毎日届かないよう、同じ状態が続くうちは
              {mail?.minResendDays ?? 3}日あけて再送します。
              <br />
              <strong>空のあいだはメールを送りません</strong>（エラーにもなりません）。
              いまは共有ドメインで運用しているため、
              <strong>Resendに登録した院長のアドレス以外には届きません</strong>
              （他を入れてもその宛先だけが失敗し、院長宛の送信は妨げません）。
            </p>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={3}
              placeholder={"staff@example.com\nclinic@example.com"}
              className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />

            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
              {mail === null ? (
                <p className="text-[11px] text-gray-600">送信設定を確認中…</p>
              ) : mail.configured ? (
                <>
                  <p className="text-[11px] text-gray-700">
                    🟢 送信できる状態です（差出人: {mail.from}）
                    {mail.lastSentOn && <>／ 最後の定期送信: {mail.lastSentOn}</>}
                  </p>
                  {!mail.cronReady && (
                    <p className="text-[11px] text-amber-800">
                      🟡 毎朝の自動送信はまだ動きません（Vercelに{" "}
                      <code>CRON_SECRET</code> が未設定）。設定するまでは、この画面の
                      「テスト送信」でのみ送れます。
                    </p>
                  )}
                  {mail.entries.length > 0 && (
                    <ul className="text-[11px] text-gray-600 space-y-0.5">
                      {mail.entries.map((e, i) => (
                        <li key={`${e.at}-${i}`}>
                          {e.ok ? (e.failedCount > 0 ? "⚠️" : "✅") : "⛔"}{" "}
                          {e.at.slice(0, 16).replace("T", " ")}
                          　{e.kind === "test" ? "テスト" : "定期"}／滞留{e.staleCount}件／送信
                          {e.sentCount}件・失敗{e.failedCount}件（宛先{e.toCount}件）
                          {e.error && (
                            <span className="text-red-700">　{e.error}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-amber-800">
                  🟡 まだメールは送られません（Vercelに <code>RESEND_API_KEY</code>{" "}
                  が未設定）。
                  <code className="mx-1">
                    ~/Downloads/155_Resendセットアップ手順_院長用.md
                  </code>
                  の手順で設定してください。設定するまではアプリ内のバッジだけで動きます。
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={testing || !mail?.configured}
                  className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[36px]"
                >
                  {testing ? "送信中…" : "✉️ テスト送信"}
                </button>
                <span className="text-[10px] text-gray-500">
                  ※ 保存してから押してください（保存前の宛先には届きません）
                </span>
              </div>
              {mailMsg && <p className="text-[11px] text-teal-800">{mailMsg}</p>}
            </div>
          </section>

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
