"use client";

// 📝 年次 自己評価シート（指示書111・機能ID self_review）
// - 採点表ではなく、面談で院長と対話するための準備シート（紙シートv3を忠実に移植）。
// - データは private_store のみ（content_type "self_review"・record_key=評価期）。
//   アクセスは private-store-client.ts 経由＝認証付きAPIのみ。anon 直読みは一切しない。
// - 提出後ロック: 提出すると本人は編集不可（サーバー側でも非管理者PUTを409で強制・指示書111 STEP3）。
//   院長（管理者）が差し戻すと下書きに戻り再編集できる。
// - 全項目、空のまま保存・提出可（必須項目は設けない）。

import { useState, useEffect, useCallback } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  getRecord,
  upsertRecord,
  PrivateStoreError,
} from "@/lib/private-store-client";
import {
  emptySelfReviewData,
  normalizeSelfReviewData,
  loadSelfReviewConfig,
  SELF_REVIEW_INTRO,
  MINORI_INTRO,
  MINORI_ITEMS,
  ARIKATA_ITEMS,
  OUTPUT_ITEMS,
  RANK_INTRO,
  RANK_QUESTION,
  RANK_REASON_LABEL,
  RANK_NOTE,
  GRADE_AXIS_TABLE,
  RAIKI_ITEMS,
  GRADES,
  RANK_VALUES,
  SUBMIT_CONFIRM,
  SUBMITTED_NOTE,
  type SelfReviewData,
  type SelfReviewConfig,
  type SelfReviewRank,
} from "@/lib/self-review";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { loadProfilesIndex } from "@/lib/staff-profiles";

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

function SelfReviewPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [config, setConfig] = useState<SelfReviewConfig | null>(null);
  const [data, setData] = useState<SelfReviewData>(emptySelfReviewData());
  const [myName, setMyName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  const locked = data.status === "submitted";

  const load = useCallback(async () => {
    try {
      // ログイン確認と自分の表示名（プロフィール登録名）の解決
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState("unauthenticated");
        return;
      }
      const profiles = await loadProfilesIndex().catch(() => []);
      const mine = profiles.find((p) => p.userId === user.id);
      setMyName(mine?.name?.trim() || "名前未設定");

      const cfg = await loadSelfReviewConfig();
      setConfig(cfg);
      const record = await getRecord("self_review", cfg.currentPeriod);
      setData(
        record ? normalizeSelfReviewData(record.data) : emptySelfReviewData()
      );
      setState("ready");
    } catch (e) {
      if (e instanceof PrivateStoreError && e.kind === "unauthenticated") {
        setState("unauthenticated");
        return;
      }
      setError(
        e instanceof Error ? e.message : "読み込みに失敗しました"
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (submit: boolean) => {
    if (!config || saving || locked) return;
    if (submit && !confirm(SUBMIT_CONFIRM)) return;
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const next: SelfReviewData = {
        ...data,
        status: submit ? "submitted" : "draft",
        name: myName,
        period_label: config.label,
        filled_at: submit ? new Date().toISOString() : data.filled_at,
      };
      const saved = await upsertRecord(
        "self_review",
        config.currentPeriod,
        next
      );
      setData(normalizeSelfReviewData(saved.data));
      setSavedNote(submit ? "📮 提出しました" : "💾 下書きを保存しました");
    } catch (e) {
      if (e instanceof PrivateStoreError) {
        setError(e.message);
      } else {
        setError("保存に失敗しました。もう一度お試しください。");
      }
    } finally {
      setSaving(false);
    }
  };

  const setMinori = (key: string, v: string) =>
    setData((d) => ({
      ...d,
      sections: {
        ...d.sections,
        minori: { ...d.sections.minori, [key]: v },
      },
    }));
  const setArikata = (key: string, v: string) =>
    setData((d) => ({
      ...d,
      sections: {
        ...d.sections,
        arikata: { ...d.sections.arikata, [key]: v },
      },
    }));
  const setOutput = (key: string, v: string) =>
    setData((d) => ({
      ...d,
      sections: {
        ...d.sections,
        output: { ...d.sections.output, [key]: v },
      },
    }));
  const setRaiki = (key: string, v: string) =>
    setData((d) => ({
      ...d,
      sections: {
        ...d.sections,
        raiki: { ...d.sections.raiki, [key]: v },
      },
    }));

  if (state === "loading") {
    return (
      <p className="text-sm text-gray-500 py-16 text-center animate-pulse">
        読み込んでいます…
      </p>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-gray-800">
          自己評価シートの記入にはログインが必要です。
        </p>
        <a
          href="/login"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700"
        >
          ログインする
        </a>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3 inline-block">
          {error || "読み込みに失敗しました"}
        </p>
        <p className="text-xs text-gray-500">
          ページを再読み込みしても直らない場合は院長にお知らせください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダ: 評価期・ステータス */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">
          対象期間: {config?.label ?? ""}
        </span>
        {locked ? (
          <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
            ✅ 提出済み
          </span>
        ) : (
          <span className="text-[10px] font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
            ✏️ 下書き
          </span>
        )}
      </div>

      {/* 冒頭説明文（指定どおり） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
        {SELF_REVIEW_INTRO}
      </p>

      {locked && (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          {SUBMITTED_NOTE}
        </p>
      )}

      {/* 基本情報 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">基本情報</h2>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <div>
            <span className="text-xs text-gray-500 block">氏名</span>
            <span className="text-gray-800">{myName}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">等級（本人申告）</span>
            <select
              value={data.grade}
              disabled={locked}
              onChange={(e) => setData((d) => ({ ...d, grade: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">未選択</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">記入日</span>
            <span className="text-gray-800">
              {data.filled_at
                ? new Date(data.filled_at).toLocaleDateString("ja-JP")
                : "（提出時に自動記録）"}
            </span>
          </div>
        </div>
      </section>

      {/* 1. 今期の実 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            1. 今期の実（7つの実で振り返る）
          </h2>
          <p className="text-xs text-gray-500 mt-1">{MINORI_INTRO}</p>
        </div>
        {MINORI_ITEMS.map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-sm font-medium text-gray-800 block">
              {item.label}
              <span className="text-xs text-gray-500 font-normal ml-2">
                — {item.hint}
              </span>
            </label>
            <textarea
              value={data.sections.minori[item.key]}
              disabled={locked}
              onChange={(e) => setMinori(item.key, e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        ))}
      </section>

      {/* 2. 在り方の振り返り */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">
          2. 在り方の振り返り（感謝・誠実・分かち愛）
        </h2>
        {ARIKATA_ITEMS.map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-sm font-medium text-gray-800 block">
              {item.label}
              <span className="text-xs text-gray-500 font-normal ml-2">
                — {item.hint}
              </span>
            </label>
            <textarea
              value={data.sections.arikata[item.key]}
              disabled={locked}
              onChange={(e) => setArikata(item.key, e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        ))}
      </section>

      {/* 3. 分かち合い・アウトプット */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">
          3. 分かち合い・アウトプットの振り返り
        </h2>
        {OUTPUT_ITEMS.map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-sm font-medium text-gray-800 block">
              {item.label}
            </label>
            <textarea
              value={data.sections.output[item.key]}
              disabled={locked}
              onChange={(e) => setOutput(item.key, e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        ))}
      </section>

      {/* 4. 自己評価ランク */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            4. 自己評価ランク
          </h2>
          <p className="text-xs text-gray-500 mt-1">{RANK_INTRO}</p>
        </div>
        {/* 等級重心表（参考・静的） */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">等級</th>
                <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">時代</th>
                <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">
                  重心（知識：スキル：マインド）
                </th>
                <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">ひとことで</th>
              </tr>
            </thead>
            <tbody>
              {GRADE_AXIS_TABLE.map((row) => (
                <tr key={row.grade}>
                  <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{row.grade}</td>
                  <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{row.era}</td>
                  <td className="border border-gray-200 px-2 py-1.5 whitespace-nowrap">{row.weight}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800">{RANK_QUESTION}</p>
          <div className="flex gap-2 flex-wrap">
            {RANK_VALUES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={locked}
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    sections: {
                      ...d.sections,
                      rank: {
                        ...d.sections.rank,
                        // 同じランクをもう一度押すと未選択に戻せる
                        value: (d.sections.rank.value === r
                          ? ""
                          : r) as SelfReviewRank,
                      },
                    },
                  }))
                }
                className={`w-12 h-12 rounded-xl text-base font-semibold border transition-colors disabled:opacity-60 ${
                  data.sections.rank.value === r
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-teal-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="text-sm font-medium text-gray-800 block pt-1">
            {RANK_REASON_LABEL}
          </label>
          <textarea
            value={data.sections.rank.reason}
            disabled={locked}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                sections: {
                  ...d.sections,
                  rank: { ...d.sections.rank, reason: e.target.value },
                },
              }))
            }
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-600"
          />
          <p className="text-xs text-gray-500">{RANK_NOTE}</p>
        </div>
      </section>

      {/* 5. 来期に向けて */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">
          5. 来期に向けて（願望 → 計画）
        </h2>
        {RAIKI_ITEMS.map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-sm font-medium text-gray-800 block">
              {item.label}
            </label>
            <textarea
              value={data.sections.raiki[item.key]}
              disabled={locked}
              onChange={(e) => setRaiki(item.key, e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        ))}
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}
      {savedNote && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">
          {savedNote}
        </p>
      )}

      {/* 操作 */}
      {!locked && (
        <div className="flex items-center justify-end gap-2 flex-wrap pb-8">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="text-sm px-4 py-2 border border-teal-600 text-teal-700 rounded-full hover:bg-teal-50 disabled:opacity-50 min-h-[40px]"
          >
            {saving ? "保存中…" : "💾 下書き保存"}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 min-h-[40px]"
          >
            {saving ? "送信中…" : "📮 提出する"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SelfReviewPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/self-review"
        title="📝 年次 自己評価シート"
        description="半期面談・年次対話の入口"
      />
      <FeatureGate feature="self_review">
        <SelfReviewPageBody />
      </FeatureGate>
    </div>
  );
}
