"use client";

// ✅ はじめてガイド（オンボーディングチェックリスト・指示書113・機能ID onboarding）
// - テンプレ（項目）は content_store の onboarding_template（全員閲覧可）。
// - 自分のチェック進捗は private_store（content_type "onboarding"・record_key "progress" 固定）。
//   アクセスは private-store-client.ts 経由＝認証付きAPIのみ。他のスタッフの進捗は一切表示しない
//   （データ構造上も本人＋管理者しか読めない・指示書113）。
// - チェックは項目の不変IDに紐づく（ラベル編集で外れない）。テンプレから消えた項目の
//   チェック（孤児ID）は集計・表示とも無視する（エラーにしない）。

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  getRecord,
  upsertRecord,
  PrivateStoreError,
} from "@/lib/private-store-client";
import {
  loadOnboardingTemplate,
  emptyOnboardingTemplate,
  emptyOnboardingProgress,
  normalizeOnboardingProgress,
  countOnboardingProgress,
  ONBOARDING_PROGRESS_KEY,
  ONBOARDING_INTRO,
  ONBOARDING_EMPTY_NOTE,
  type OnboardingTemplate,
  type OnboardingProgressData,
} from "@/lib/onboarding";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { loadPortalObject } from "@/lib/portal-store";
import {
  LIBRARY_KEY,
  normalizeStore as normalizeLibraryStore,
  type LibraryDoc,
} from "@/lib/library";

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

function OnboardingPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [template, setTemplate] = useState<OnboardingTemplate>(
    emptyOnboardingTemplate()
  );
  const [progress, setProgress] = useState<OnboardingProgressData>(
    emptyOnboardingProgress()
  );
  const [libraryDocs, setLibraryDocs] = useState<LibraryDoc[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState("unauthenticated");
        return;
      }
      const [tmpl, record, libRaw] = await Promise.all([
        loadOnboardingTemplate(),
        getRecord("onboarding", ONBOARDING_PROGRESS_KEY),
        loadPortalObject<unknown>(LIBRARY_KEY, null).catch(() => null),
      ]);
      setTemplate(tmpl);
      setProgress(
        record
          ? normalizeOnboardingProgress(record.data)
          : emptyOnboardingProgress()
      );
      setLibraryDocs(normalizeLibraryStore(libRaw).docs);
      setState("ready");
    } catch (e) {
      if (e instanceof PrivateStoreError && e.kind === "unauthenticated") {
        setState("unauthenticated");
        return;
      }
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // チェックのON/OFF（即保存・失敗時は元に戻す）。取り消しはキーごと削除（指示書113）
  const toggle = async (itemId: string) => {
    if (savingId) return;
    const prev = progress;
    const checking = !prev.checked[itemId];
    const nextChecked = { ...prev.checked };
    if (checking) {
      nextChecked[itemId] = new Date().toISOString();
    } else {
      delete nextChecked[itemId];
    }
    const next: OnboardingProgressData = {
      checked: nextChecked,
      updatedAt: new Date().toISOString(),
    };
    setProgress(next);
    setSavingId(itemId);
    setError("");
    try {
      const saved = await upsertRecord(
        "onboarding",
        ONBOARDING_PROGRESS_KEY,
        next
      );
      setProgress(normalizeOnboardingProgress(saved.data));
      if (checking) showToast("1つ進みました 🌱");
    } catch (e) {
      setProgress(prev);
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "保存に失敗しました。もう一度お試しください。"
      );
    } finally {
      setSavingId(null);
    }
  };

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
          チェックの記録にはログインが必要です。
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

  const { done, total } = countOnboardingProgress(template, progress);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 冒頭説明文（指定どおり） */}
      <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
        {ONBOARDING_INTRO}
      </p>

      {total === 0 ? (
        <p className="text-sm text-gray-600 text-center py-12">
          {ONBOARDING_EMPTY_NOTE}
        </p>
      ) : (
        <>
          {/* 自分の進捗（自分自身の鏡なので数字表示可・指示書113） */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-800">
                わたしの進捗
              </h2>
              <span className="text-sm text-gray-700 tabular-nums">
                {done} / {total}（{percent}%）
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </section>

          {/* セクションごとのチェックリスト */}
          {template.sections.map((section) => (
            <section
              key={section.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
            >
              <h2 className="text-sm font-semibold text-gray-800">
                {section.title}
              </h2>
              {section.items.length === 0 ? (
                <p className="text-xs text-gray-500">
                  この段階の項目はまだありません
                </p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((item) => {
                    const checkedAt = progress.checked[item.id] || "";
                    // 削除済み（解決できない）資料はリンクを出さない（指示書113）
                    const doc = item.docId
                      ? libraryDocs.find((d) => d.id === item.docId)
                      : undefined;
                    return (
                      <li
                        key={item.id}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                          checkedAt
                            ? "border-teal-200 bg-teal-50/50"
                            : "border-gray-100 bg-gray-50/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!checkedAt}
                          disabled={savingId !== null}
                          onChange={() => toggle(item.id)}
                          aria-label={item.label}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-teal-600 cursor-pointer disabled:cursor-wait"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p
                            className={`text-sm break-words ${
                              checkedAt
                                ? "text-gray-500 line-through decoration-teal-300"
                                : "text-gray-800"
                            }`}
                          >
                            {item.label}
                          </p>
                          {item.note && (
                            <p className="text-xs text-gray-500 break-words">
                              {item.note}
                            </p>
                          )}
                          {doc && (
                            // 119: 新しいタブで開く（タブを閉じるだけでチェックリストに戻れる）
                            <Link
                              href={`/library?doc=${encodeURIComponent(doc.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100 mt-1"
                            >
                              📄 {doc.title} ↗
                            </Link>
                          )}
                        </div>
                        {checkedAt && (
                          <span className="text-[10px] text-teal-700 shrink-0 mt-1 tabular-nums">
                            {new Date(checkedAt).toLocaleDateString("ja-JP")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* さりげない肯定トースト（GanttChart のローカルトーストと同じ流儀） */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-gray-800 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/onboarding"
        title="✅ はじめてガイド"
        description="新しい仲間が安心して一歩ずつ進むためのチェックリスト"
      />
      <FeatureGate feature="onboarding">
        <OnboardingPageBody />
      </FeatureGate>
    </div>
  );
}
