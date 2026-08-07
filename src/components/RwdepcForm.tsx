"use client";

// RWDEPC対話モードの入力欄（指示書153）
// R は入力欄にせず、冒頭の「場づくりリマインダー」として常時表示する。
// 入力するのは W→D→E→P→C の5つ。1画面スクロール構成にした
// （段階ウィザードだと前後の文脈が見えず、対話しながら行き来しづらいため）。
//
// 【原則】スコア・評価的な集計は表示しない（152と同じ）。
// E欄は本人の自己評価を書く欄なので、ガード文をラベル直下に常時出す。

import { useState } from "react";
import {
  RWDEPC_E_GUARD,
  RWDEPC_REMINDERS,
  RWDEPC_STEPS,
  type RwdepcData,
  type RwdepcStepKey,
} from "@/lib/rwdepc";

/** ヒントに出す問いかけの数（💡で全部に切り替えられる） */
const HINT_PREVIEW = 3;

export function RwdepcReminders() {
  return (
    <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
      <p className="text-xs font-medium text-violet-900 mb-1">
        R｜場づくり（話す前に）
      </p>
      <ul className="space-y-0.5">
        {RWDEPC_REMINDERS.map((line) => (
          <li key={line} className="text-xs text-gray-800 leading-relaxed">
            ・{line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RwdepcForm({
  value,
  onChange,
  disabled = false,
  /** 153-③: 前回の約束（同じ相手の直前のRWDEPCのC）。無ければ null */
  previousPromise,
  previousPromiseDate,
  /** 153-③: 「7つの実『実行』にチェック」への導線。自動チェックはしない */
  onOpenJikko,
  /** 153-④: 前回のW（願望）。コピーして更新できる */
  previousW,
  previousWDate,
  /** 153-④: 過去のWの変遷（新しい順・{heldOn, w}） */
  wHistory,
}: {
  value: RwdepcData;
  onChange: (next: RwdepcData) => void;
  disabled?: boolean;
  previousPromise?: string | null;
  previousPromiseDate?: string | null;
  onOpenJikko?: () => void;
  previousW?: string | null;
  previousWDate?: string | null;
  wHistory?: { heldOn: string; w: string }[];
}) {
  const [openHint, setOpenHint] = useState<RwdepcStepKey | null>(null);
  const [showWHistory, setShowWHistory] = useState(false);

  const set = (k: RwdepcStepKey, v: string) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      <RwdepcReminders />

      {/* ③ 前回の約束 → ここからDへ自然に入る */}
      {previousPromise && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-medium text-amber-900">
            🔗 前回の約束
            {previousPromiseDate && (
              <span className="ml-2 font-normal text-gray-600">
                （{previousPromiseDate.replaceAll("-", "/")}）
              </span>
            )}
          </p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed mt-1">
            {previousPromise}
          </p>
          {onOpenJikko && (
            <button
              type="button"
              onClick={onOpenJikko}
              disabled={disabled}
              className="mt-2 text-xs px-3 py-1.5 border border-amber-300 text-amber-900 rounded-full bg-white hover:bg-amber-100 disabled:opacity-40 min-h-[36px]"
            >
              実行できていたら「7つの実」の実行を開く
            </button>
          )}
          <p className="text-[11px] text-gray-600 mt-1.5">
            チェックは自動では付きません。対話しながら一緒に確認してください。
          </p>
        </div>
      )}

      {RWDEPC_STEPS.map((step) => {
        const isW = step.key === "w";
        const isE = step.key === "e";
        const hintOpen = openHint === step.key;
        const questions = hintOpen
          ? step.questions
          : step.questions.slice(0, HINT_PREVIEW);
        return (
          <div key={step.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-800">
                <span className="inline-block w-6 text-violet-700">
                  {step.mark}
                </span>
                ｜{step.label}
              </label>
              <button
                type="button"
                onClick={() => setOpenHint(hintOpen ? null : step.key)}
                className="text-xs px-2 py-1 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 min-h-[32px]"
              >
                💡 問いかけ例
              </button>
            </div>

            {/* ② E欄のガード（常時表示） */}
            {isE && (
              <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {RWDEPC_E_GUARD}
              </p>
            )}

            {/* ④ 前回のW（コピーして更新できる） */}
            {isW && previousW && (
              <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-[11px] text-gray-600">
                  前回のW
                  {previousWDate && `（${previousWDate.replaceAll("-", "/")}）`}
                </p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed mt-0.5">
                  {previousW}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => set("w", previousW)}
                    disabled={disabled}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 min-h-[36px]"
                  >
                    コピーして書き換える
                  </button>
                  {(wHistory?.length ?? 0) > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowWHistory((v) => !v)}
                      className="text-xs text-violet-700 underline hover:opacity-70"
                    >
                      {showWHistory ? "変遷をたたむ" : "これまでのWの変遷"}
                    </button>
                  )}
                </div>
                {showWHistory && (
                  <ul className="mt-2 space-y-1.5 border-t border-gray-200 pt-2">
                    {wHistory?.map((h) => (
                      <li key={h.heldOn + h.w.slice(0, 8)}>
                        <p className="text-[11px] text-gray-500">
                          {h.heldOn.replaceAll("-", "/")}
                        </p>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {h.w}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
              {questions.map((q) => (
                <li key={q} className="text-[11px] text-gray-500">
                  ・{q}
                </li>
              ))}
            </ul>

            <textarea
              value={value[step.key]}
              onChange={(e) => set(step.key, e.target.value)}
              disabled={disabled}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y"
            />
          </div>
        );
      })}
    </div>
  );
}

/** ⑤ 問いかけ集（読むだけモード） */
export function RwdepcGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-gray-900">
          📖 RWDEPC 問いかけ集
          <span className="ml-2 text-xs font-normal text-gray-600">
            読むだけ・対話の観点として
          </span>
        </span>
        <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <RwdepcReminders />
          {RWDEPC_STEPS.map((step) => (
            <div key={step.key}>
              <p className="text-sm font-medium text-gray-900">
                <span className="inline-block w-6 text-violet-700">
                  {step.mark}
                </span>
                ｜{step.label}
              </p>
              <ul className="mt-1 space-y-1">
                {step.questions.map((q) => (
                  <li
                    key={q}
                    className="text-sm text-gray-800 leading-relaxed pl-4 -indent-4"
                  >
                    ・{q}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
