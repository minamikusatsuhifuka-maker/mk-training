"use client";

// 📣 お知らせ・イベントのアプリ内の知らせ（指示書228 §2-1・§5）
//   NoticesNavMark    … メニューの印（未読の数・未回答の数）
//   NoticesHomeBanner … ホーム上部の知らせ（新しいお知らせ／出欠の締切の3日前〜締切日で未回答のイベント）
// 数はサーバーが本人の分だけ数えて返す（ほかの人の回答や人数は来ない）。

import Link from "next/link";
import { useNoticeSummary } from "@/lib/notices-client";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import {
  deadlineDaysLeft,
  deadlineLeftText,
  deadlineTone,
  formatYmdJp,
  rsvpAlertText,
  type DeadlineTone,
} from "@/lib/notices";

// 230 §1: 締切の色（8日以上=緑／7〜2日=オレンジ／前日〜当日=赤／過ぎた=灰）。文字（あと○日）も必ず添える
const TONE_CLASS: Record<DeadlineTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  orange: "border-orange-300 bg-orange-50 text-orange-800",
  red: "border-red-300 bg-red-50 text-red-700",
  past: "border-gray-200 bg-gray-100 text-gray-600",
};

/**
 * 出欠の締切の表示（230 §1）。colored=true は「まだ出欠を出していない（出欠をとる相手の）人」だけ。
 * 出した人・相手でない人には色を付けず、締切の日付だけを出す。
 */
export function DeadlineMark({ deadline, today, colored }: { deadline: string; today: string; colored: boolean }) {
  const left = deadlineDaysLeft(deadline, today);
  if (!colored || left === null) return <span data-deadline-plain>{formatYmdJp(deadline)}</span>;
  const tone = deadlineTone(left);
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-deadline-tone={tone}>
      <span>{formatYmdJp(deadline)}</span>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone]}`}>{deadlineLeftText(left)}</span>
    </span>
  );
}

/**
 * 230 §2: 締切3日前から締切まで、まだ出欠を出していない人への帯（ホームの上と、お知らせ・イベントのページの上）。
 * 対象はサーバーが本人の分だけ数える（検証用アカウントには検証用のイベントだけ）。出欠を出すとすぐ消える。
 */
export function RsvpAlertBanners({ enabled = true }: { enabled?: boolean }) {
  const s = useNoticeSummary(enabled);
  if (!s || s.reminders.length === 0) return null;
  return (
    <div className="space-y-1.5" data-rsvp-alerts>
      {s.reminders.map((r) => {
        const tone = deadlineTone(r.daysLeft);
        return (
          <Link
            key={r.id}
            href={`${HREF}?id=${encodeURIComponent(r.id)}`}
            className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium min-h-[44px] ${TONE_CLASS[tone]}`}
            data-notices-reminder
            data-deadline-tone={tone}
          >
            <span className="min-w-0">
              🙋 {rsvpAlertText(r.title, r.rsvpDeadline)}
              <span className="ml-1 text-xs font-bold">（{deadlineLeftText(r.daysLeft)}）</span>
            </span>
            <span className="shrink-0 text-xs underline underline-offset-2">回答する →</span>
          </Link>
        );
      })}
    </div>
  );
}

const HREF = "/notices";

export function NoticesNavMark({ href }: { href: string }) {
  // メニューに項目が出ている（＝その人が使える）ときだけ数を取りに行く
  const s = useNoticeSummary(href === HREF);
  if (href !== HREF || !s) return null;
  if (s.unread === 0 && s.unanswered === 0) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle" data-notices-nav-mark>
      {s.unread > 0 && (
        <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white" title={`まだ開いていないもの ${s.unread}件`}>
          未読{s.unread}
        </span>
      )}
      {s.unanswered > 0 && (
        <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white" title={`出欠が未回答のイベント ${s.unanswered}件`}>
          未回答{s.unanswered}
        </span>
      )}
    </span>
  );
}

export function NoticesHomeBanner() {
  const { flags, loaded } = useFeatureFlags();
  const enabled = loaded && flags.notices;
  const s = useNoticeSummary(enabled);
  if (!s || (s.unread === 0 && s.reminders.length === 0)) return null;
  return (
    <div className="space-y-1.5" data-notices-banner>
      <RsvpAlertBanners enabled={enabled} />
      {s.unread > 0 && (
        <Link
          href={HREF}
          className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-900 min-h-[44px]"
          data-notices-unread
        >
          <span className="min-w-0">📣 まだ開いていないお知らせ・イベントが {s.unread}件 あります</span>
          <span className="shrink-0 text-xs underline underline-offset-2">見る →</span>
        </Link>
      )}
    </div>
  );
}
