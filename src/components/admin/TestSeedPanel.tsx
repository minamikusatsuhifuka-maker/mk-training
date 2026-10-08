"use client";
// 🧪 検証用データ（指示書191）— 院長のみ
//   作成: 2アカウントのパスワードを院長が入力（画面・ログに残さない）→ 架空データを作成 → メールアドレスを表示（パスワードは表示しない）
//   削除: 189 の削除用パスワードを入力 → 検証用の印が付いたものだけを一括削除 → 件数を表示

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TEST_PASSWORD_MIN, TEST_PROSPECT_NAME, validateTestPassword } from "@/lib/test-seed";

type Status = { accounts: { key: string; email: string; displayName: string; userId: string; exists: boolean }[]; prospect: boolean; counts: Record<string, number> };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

// 一括削除の対象一覧の読み方（203 §3-8）。知らない種類はそのまま出す（取りこぼしに気づけるように）
const COUNT_LABEL: Record<string, string> = {
  learning: "学びの記録",
  goal: "目標",
  feedback: "フィードバック",
  promise: "1on1の約束の取り組み状況",
  schedule: "次回1on1の予定",
  // 205: 1on1の日程調整
  slot_period: "1on1の日程の期間",
  slot: "1on1の枠",
  booking: "1on1の予約",
  booking_notice: "予約の動きの知らせ",
  booking_rebook: "取り直しのお願い",
  booking_hold: "予約の持ち分（1期間1枠の印）",
  // 207-4: 委任と担当の指定も対象一覧に出す
  karte_assignment: "成長記録の担当の指定",
  item_delegation: "管理画面の委任",
  presurvey_alert_sent: "知らせを送った記録",
  course: "講座",
  grade: "等級・キャリアライン",
  gate_check: "ゲートの確認",
  matrix_review: "合意した位置",
  pref: "表示の設定",
  "private:one_on_one": "1on1の記録",
  "private:one_on_one_presurvey": "1on1の事前アンケートの回答",
  "private:self_review": "自己評価シート",
  private_store: "（private_store 合計）",
  contacts: "連絡先",
  hiring_docs: "採用資料",
  prospects: "入職予定者",
};

function countLines(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([k]) => k !== "private_store")
    .map(([k, v]) => `${COUNT_LABEL[k] ?? k} ${v}`)
    .join("・");
}

const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";

const DATA_LIST = [
  "テスト花子: 連絡先（架空の住所・電話・緊急連絡先・家族構成）／学びの記録 2件（ATC 初回・2回目、複数日）／目標 6件（目的→3年後→年間→半期→月→週）／院長との1on1 4回（6/1・7/7・8/4・9/1。約束と取り組み状況つき）／テスト次郎（担当幹部）が記録した1on1 1回（9/22）／フィードバック 3件（ポジティブ2・ギャップ1）／5つの基本的欲求サーベイ 2回分（詳細も公開）／自己評価シート（S1×M1・G1→G2 の到達状態）／ゲート「医療安全・感染対策の理解」の確認○／合意した位置 1件（半期面談）／事前アンケートの過去の回答 2件（6/1＝旧形式の9問・9/22＝2部構成。時期ごとの横並びの比較を試すため）／1on1の録音・書き起こしの同意の印（書き起こしの取り込みを試すため。取り込んで保存した1on1も削除の対象になります）",
  "テスト次郎: 学びの記録 3件（ATC・ダイナミック・リードマネジメント）／自己評価の位置 S3×M3／テスト花子の担当幹部に指定／院長との1on1 1回（9/15。約束と取り組み状況つき）／次回1on1の予定 10/20（相手：院長）と、その回答済みの事前アンケート 1件",
  `入職予定者「${TEST_PROSPECT_NAME}」: 面接の記録（架空の文章）を登録済み`,
  "作らないもの: お知らせ・気づき・ありがとうカード・書類進捗・ヒヤリハットなどの投稿、採用資料・スカウターの原本（画像・PDF）",
];

export function TestSeedPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [delPw, setDelPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [created, setCreated] = useState<Record<string, number> | null>(null);
  const [deleted, setDeleted] = useState<Record<string, number> | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api("/api/admin/test-seed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError("");
    setMsg("");
    const e1 = validateTestPassword(pw1);
    const e2 = validateTestPassword(pw2);
    if (e1 || e2) return setError(`テスト花子: ${e1 || "OK"} ／ テスト次郎: ${e2 || "OK"}`);
    if (!confirm("検証用の2アカウントと架空データを作成します（既にあれば作り直し、重複はしません）。よろしいですか？")) return;
    setBusy(true);
    try {
      const j = await api<{ created: Record<string, number> }>("/api/admin/test-seed", { method: "POST", body: JSON.stringify({ passwordHanako: pw1, passwordJiro: pw2 }) });
      setPw1("");
      setPw2("");
      setCreated(j.created);
      setDeleted(null);
      setMsg("🧪 検証用データを作成しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    setError("");
    setMsg("");
    if (!delPw) return setError("削除用パスワードを入力してください");
    if (!confirm("検証用アカウント2つと、それに紐づくすべての記録、入職予定者「テスト三郎」を削除します。\n\n削除すると元に戻せません。よろしいですか？")) return;
    setBusy(true);
    try {
      const j = await api<{ deleted: Record<string, number> }>("/api/admin/test-seed", { method: "DELETE", body: JSON.stringify({ deletePassword: delPw }) });
      setDelPw("");
      setDeleted(j.deleted);
      setCreated(null);
      setMsg("🗑 検証用データを削除しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const exists = !!status?.accounts.some((a) => a.exists);

  return (
    <div className="max-w-2xl space-y-3" data-test-seed-panel>
      <h1 className="text-lg font-bold text-gray-900">🧪 検証用データ（院長のみ）</h1>
      <p className="text-[11px] text-gray-600 leading-relaxed">
        一般スタッフ・担当幹部の立場で各機能を実際にログインして確かめるための、検証用の2アカウントと架空データです。
        検証用アカウントは一般スタッフの画面（メンバー紹介・宛先候補・集計・担当指定候補）には出ません。院長の画面には「🧪 検証用」の印が付きます。
        パスワードは作成時に入力し、Supabase Auth 以外（画面・ログ・ファイル）には残しません。
      </p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" data-seed-error>{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {status && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-800 space-y-1" data-seed-status data-exists={exists ? "1" : "0"}>
          <p className="font-medium">現在の状態</p>
          <ul className="list-disc pl-5">
            {status.accounts.map((a) => (
              <li key={a.key}>
                {a.displayName} <span className="font-mono text-[11px]">{a.email}</span> — {a.exists ? "作成済み" : "未作成"}
              </li>
            ))}
            <li>{TEST_PROSPECT_NAME} — {status.prospect ? "登録済み" : "未登録"}</li>
          </ul>
          {Object.keys(status.counts).length > 0 && (
            <p className="text-[11px] text-gray-600" data-seed-counts>
              一括削除の対象: {countLines(status.counts)}
            </p>
          )}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-seed-create>
        <h2 className="text-sm font-medium text-gray-900">1. 作成</h2>
        <details className="text-[11px] text-gray-700">
          <summary className="cursor-pointer">作成されるデータの一覧（すべて明らかに架空と分かる内容）</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {DATA_LIST.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
        <label className="block text-[12px] text-gray-800">
          テスト花子（検証用）のパスワード（{TEST_PASSWORD_MIN}文字以上）
          <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={inputClass} aria-label="テスト花子のパスワード" />
        </label>
        <label className="block text-[12px] text-gray-800">
          テスト次郎（検証用）のパスワード（{TEST_PASSWORD_MIN}文字以上）
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputClass} aria-label="テスト次郎のパスワード" />
        </label>
        <button type="button" onClick={() => void create()} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]" data-seed-run>
          {busy ? "処理中…" : exists ? "🧪 作り直す（足りない分を作る）" : "🧪 検証用データを作成"}
        </button>
        {created && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-2 text-[12px] text-teal-900 space-y-1" data-seed-created>
            <p className="font-medium">作成しました。ログイン用メールアドレス（パスワードは入力したもの）:</p>
            <ul className="list-disc pl-5 font-mono text-[11px]">
              {status?.accounts.map((a) => (
                <li key={a.key}>{a.email}</li>
              ))}
            </ul>
            <p className="text-[11px]">作成した件数: {Object.entries(created).map(([k, v]) => `${k} ${v}`).join("・") || "（既にあるものは作り直し）"}</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-red-200 bg-white p-3 space-y-2" data-seed-purge>
        <h2 className="text-sm font-medium text-gray-900">2. 検証用データをすべて削除</h2>
        <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-md p-1.5">⚠ 削除すると元に戻せません。削除するのは、検証用の印が付いたアカウントに紐づくものだけです（対象の一覧を作ってから削除し、他のデータが混ざっていれば何も消さずに止まります）。</p>
        <label className="block text-[12px] text-gray-800">
          削除用パスワード（189）
          <input type="password" autoComplete="off" value={delPw} onChange={(e) => setDelPw(e.target.value)} className={inputClass} aria-label="削除用パスワード" />
        </label>
        <p className="text-[10px] text-gray-500">
          未設定の場合は <Link href="/admin/delete-password" className="text-teal-800 underline underline-offset-2">🗑 削除用パスワードの設定</Link> で設定してください。
        </p>
        <button type="button" onClick={() => void purge()} disabled={busy || !delPw || !exists} className="px-4 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 disabled:opacity-40 min-h-[44px]" data-seed-purge-run>
          🗑 検証用データをすべて削除
        </button>
        {deleted && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-[12px] text-gray-900" data-seed-deleted>
            <p className="font-medium">削除しました（合計 {Object.values(deleted).reduce((a, b) => a + b, 0)}件）</p>
            <ul className="list-disc pl-5 text-[11px]">
              {Object.entries(deleted).map(([k, v]) => (
                <li key={k}>
                  {k} {v}件
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
