"use client";

// 📣 お知らせ・イベントのアプリ内の知らせ（指示書228 §2-1・§5）
//   NoticesNavMark    … メニューの印（未読の数・未回答の数）
//   NoticesHomeBanner … ホーム上部の知らせ（新しいお知らせ／出欠の締切の3日前〜締切日で未回答のイベント）
// 数はサーバーが本人の分だけ数えて返す（ほかの人の回答や人数は来ない）。

import Link from "next/link";
import { useNoticeSummary } from "@/lib/notices-client";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { formatYmdJp } from "@/lib/notices";

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
  const s = useNoticeSummary(loaded && flags.notices);
  if (!s || (s.unread === 0 && s.reminders.length === 0)) return null;
  return (
    <div className="space-y-1.5" data-notices-banner>
      {s.reminders.map((r) => (
        <Link
          key={r.id}
          href={`${HREF}?id=${encodeURIComponent(r.id)}`}
          className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 min-h-[44px]"
          data-notices-reminder
        >
          <span className="min-w-0">
            🙋 出欠の回答をお願いします：<span className="font-medium">{r.title}</span>
            <span className="text-xs">（締切 {formatYmdJp(r.rsvpDeadline)}）</span>
          </span>
          <span className="shrink-0 text-xs underline underline-offset-2">回答する →</span>
        </Link>
      ))}
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
