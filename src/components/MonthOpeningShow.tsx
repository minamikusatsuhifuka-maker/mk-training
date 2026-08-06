"use client";

// 月初のお披露目演出（指示書146-A/B）
// 月の初回アクセス時に1回だけ、キャラの行進 → 今月の意識目標カード の順で流す。
// - 146-A（mascot_duty）と146-B（slogan_show）は独立フラグだが、両方ONのときは
//   演出を重ね掛けせず「行進→スローガン」の1本の流れに統合する（指示書の指定）。
// - 表示済みの記録は端末単位（localStorage・月ごとのキー）。
// - OSの「視差効果を減らす」がONなら行進は流さず、静止のお披露目カードだけを出す。
// - 当月スローガンが未設定なら、スローガンのくだりは出さない（146-B単独ONなら何も出ない）。

import { useCallback, useEffect, useState } from "react";
import { CharacterSVG } from "@/components/CharacterNotification";
import { loadCharacterOrderedChoices } from "@/lib/character-order";
import {
  currentYm,
  loadMascotDuty,
  mascotForYm,
  mascotLabel,
} from "@/lib/mascot-duty";
import {
  formatYmJa,
  loadMonthlySlogans,
  sloganForYm,
  type MonthlySlogan,
} from "@/lib/monthly-slogan";
import type { CharacterSvgType } from "@/types/portal";

const SEEN_PREFIX = "mk_month_opening_";
const PARADE_MS = 5200;

type Phase = "parade" | "slogan";

function alreadySeen(ym: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + ym) === "1";
  } catch {
    return false;
  }
}

function markSeen(ym: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + ym, "1");
  } catch {
    /* プライベートブラウズ等では記録できない。毎回出るだけで害はない */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function MonthOpeningShow({
  mascotEnabled,
  sloganEnabled,
}: {
  mascotEnabled: boolean;
  sloganEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("parade");
  const [reduced, setReduced] = useState(false);
  const [cast, setCast] = useState<CharacterSvgType[]>([]);
  const [duty, setDuty] = useState<CharacterSvgType | null>(null);
  const [slogan, setSlogan] = useState<MonthlySlogan | null>(null);

  const ym = currentYm();

  const close = useCallback(() => {
    setOpen(false);
    markSeen(ym);
  }, [ym]);

  useEffect(() => {
    if (!mascotEnabled && !sloganEnabled) return;
    if (alreadySeen(ym)) return;
    let cancelled = false;

    (async () => {
      const [dutyStore, slogans, choices] = await Promise.all([
        loadMascotDuty(),
        sloganEnabled ? loadMonthlySlogans() : Promise.resolve([]),
        loadCharacterOrderedChoices(),
      ]);
      if (cancelled) return;

      const thisMonthSlogan = sloganEnabled ? sloganForYm(slogans, ym) : null;
      // 146-B 単独ONで当月スローガンが未設定なら演出そのものを出さない
      if (!mascotEnabled && !thisMonthSlogan) return;

      const rm = prefersReducedMotion();
      setReduced(rm);
      setDuty(mascotForYm(dutyStore, ym));
      setSlogan(thisMonthSlogan);
      setCast(choices.map((c) => c.type));
      // 行進は146-AがONのときだけ。動きを減らす設定なら行進を飛ばす
      setPhase(mascotEnabled && !rm ? "parade" : "slogan");
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [mascotEnabled, sloganEnabled, ym]);

  // 行進が終わったら自動で次へ（スローガンが無ければそのまま閉じる）
  useEffect(() => {
    if (!open || phase !== "parade") return;
    const t = setTimeout(() => {
      if (slogan || duty) setPhase("slogan");
      else close();
    }, PARADE_MS);
    return () => clearTimeout(t);
  }, [open, phase, slogan, duty, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="今月のお披露目"
    >
      <button
        type="button"
        onClick={close}
        className="absolute top-4 right-4 px-3 py-1.5 text-xs text-white/90 bg-white/15 border border-white/30 rounded-full hover:bg-white/25 min-h-[36px]"
      >
        スキップ
      </button>

      {phase === "parade" ? (
        <div className="w-full max-w-md">
          <p className="text-center text-white text-sm font-medium mb-6">
            {formatYmJa(ym)}のはじまりです
          </p>
          <div className="relative h-24 overflow-hidden">
            {cast.map((type, i) => (
              <div
                key={type}
                className="absolute top-2 mascot-parade"
                style={{ animationDelay: `${i * 0.18}s` }}
              >
                <CharacterSVG type={type} size={52} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-lg p-5 mascot-card-in">
          {duty && (
            <div className="flex flex-col items-center">
              <div className={reduced ? "" : "mascot-card-bounce"}>
                <CharacterSVG type={duty} size={76} />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {formatYmJa(ym)}の当番は{" "}
                <span className="font-medium text-gray-800">
                  {mascotLabel(duty)}
                </span>{" "}
                です
              </p>
            </div>
          )}

          {slogan && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-medium text-amber-700 mb-2">
                🎯 今月の意識目標
              </p>
              <p className="text-base text-gray-900 leading-relaxed max-w-prose whitespace-pre-wrap">
                {slogan.slogan}
              </p>
              {slogan.note && (
                <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
                  {slogan.note}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={close}
            className="mt-5 w-full py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 text-sm font-medium min-h-[44px]"
          >
            今月もよろしくお願いします
          </button>
        </div>
      )}
    </div>
  );
}
