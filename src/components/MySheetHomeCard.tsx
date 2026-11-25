"use client";

// スタッフ個人シート §1: ホームの入口「私の個人シート」
// 第5便: 「次に行うこと」を実データで1つだけ出す（多く並べない）。
//   ① プロフィール未登録（名前が空）→ プロフィール登録へ
//   ② 🧭 サーベイ未回答 → プロフィールのサーベイへ
//   ③ サーベイの公開範囲が院内方針（詳細まで公開）とちがう → 確認のお願い
//   ④ 1on1の事前アンケートが未回答 → 締切の案内（従来どおり）
//   ⑤ どれも済んでいれば、次の1on1の日時（従来どおり）
// シートを開けない人（機能フラグ growth_record がOFF）には出さない（院長・検証用はプレビューで開けるので出る）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { useMySchedules } from "@/lib/one-on-one-schedule-client";
import { formatMonthDay, formatMonthDayW, presurveyDeadline } from "@/lib/one-on-one-schedule";
import type { StaffProfile } from "@/lib/staff-profiles";

type ProfileState =
  | { kind: "loading" }
  | { kind: "none" } // 取得できない（未ログインなど）→ 従来表示
  | { kind: "ok"; name: string; hasSurvey: boolean; surveyAligned: boolean };

export function MySheetHomeCard() {
  const { flags, loaded } = useFeatureFlags();
  const data = useMySchedules();
  const [prof, setProf] = useState<ProfileState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/profile", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { profile?: StaffProfile } | null) => {
        if (!alive) return;
        const p = j?.profile;
        if (!p) return setProf({ kind: "none" });
        setProf({
          kind: "ok",
          name: (p.name ?? "").trim(),
          hasSurvey: !!p.needsSurvey,
          surveyAligned: p.needsSurvey?.visibility === "public_details",
        });
      })
      .catch(() => alive && setProf({ kind: "none" }));
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded || !flags.growth_record) return null;
  const next = data?.mine[0];

  // 「次に行うこと」を1つだけ選ぶ（第5便）
  let action: { href: string; text: string } | null = null;
  if (prof.kind === "ok") {
    if (!prof.name) {
      action = { href: "/profile", text: "✍️ まずプロフィール登録から（お名前と職種を入れると、シートと名簿がつながります）" };
    } else if (!prof.hasSurvey) {
      action = { href: "/profile", text: "🧭 5つの基本的欲求サーベイに回答しましょう（プロフィール画面の中にあります）" };
    } else if (!prof.surveyAligned) {
      action = { href: "/profile", text: "🧭 サーベイの公開範囲の確認をお願いします（院内方針のお知らせがあります）" };
    }
  }

  return (
    <Link
      href={action ? action.href : "/my-growth"}
      className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-white p-3 hover:bg-teal-50/40"
      data-home-my-sheet
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-gray-900">📄 私の個人シート</span>
        <span className="text-xs text-teal-800 underline underline-offset-2">開く →</span>
      </span>
      {action ? (
        <span className="rounded-lg bg-teal-50 px-2 py-1 text-xs text-teal-900" data-home-next-action>
          {action.text}
        </span>
      ) : (
        <span className="text-xs text-gray-700">
          {next ? (
            <>
              次の1on1：{formatMonthDayW(next.date)}
              {next.time && ` ${next.time}`}
              {"　"}
              {next.partnerIsDirector ? "院長" : next.partnerName}
            </>
          ) : (
            "今月の目標と、前回の面談で決めたことを確かめられます。"
          )}
        </span>
      )}
      {!action && next && data?.alertsEnabled && !next.answered && (
        <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
          事前アンケートは{formatMonthDay(presurveyDeadline(next))}までです
        </span>
      )}
    </Link>
  );
}
