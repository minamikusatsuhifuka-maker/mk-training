"use client";

// 🗓 1on1の予約（指示書205 §2／機能ID one_on_one_booking）
//
// ・院長が作った枠のうち、**自分が対象の期間の空き枠だけ**が出る
//   （予約済み・ブロックの枠は出さない＝他の人の予約は分からない・205 §5）
// ・1期間に1人1枠。変更＝別の空き枠に移る（元の枠は空く）。取り消し＝枠が空く
// ・予約・変更・取り消しができるのは**実施日の4日前まで**。過ぎたら院長に伝える案内を出す
// ・同じ枠をほぼ同時に選んだときは、サーバーが1人だけ通す（2人目には理由を出して一覧を更新）
// ・スマートフォンで押しやすい大きさ（44px以上）

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  BOOKING_LOCKED_MESSAGE,
  BOOKING_NONE_LEFT_MESSAGE,
  BOOKING_PLEASE_MESSAGE,
  BOOKING_CHANGE_DAYS,
  formatDateW,
  groupByDate,
} from "@/lib/one-on-one-slots";
import { presurveyDeadline } from "@/lib/one-on-one-schedule";
import { formatJpDate } from "@/lib/presurvey-periods";
import { invalidateMySchedules } from "@/lib/one-on-one-schedule-client";

type OpenSlot = { id: string; date: string; startTime: string; endTime: string };
type MyBooking = { slotId: string; date: string; startTime: string; endTime: string } | null;
type PeriodView = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  myBooking: MyBooking;
  canChange: boolean;
  changeDeadline: string;
  openSlots: OpenSlot[];
};
type Payload = { enabled: boolean; today: string; periods: PeriodView[] };

function periodLabel(p: PeriodView): string {
  return p.label || `${formatDateW(p.startDate)}〜${formatDateW(p.endDate)}`;
}

function BookingPageBody() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  /** 確認中の枠 */
  const [confirming, setConfirming] = useState<{ period: PeriodView; slot: OpenSlot } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/one-on-one/booking", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      setData({ enabled: j.enabled === true, today: j.today ?? "", periods: j.periods ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
      setData({ enabled: true, today: "", periods: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const book = async (period: PeriodView, slot: OpenSlot) => {
    setBusy(slot.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/one-on-one/booking", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; moved?: boolean; error?: string };
      if (!res.ok) {
        setError(j.error || "予約できませんでした");
        await load(); // 先に取られていたら一覧を更新する
        return;
      }
      setConfirming(null);
      await load();
      void invalidateMySchedules();
      setMessage(
        `${j.moved ? "予約を変更しました" : "予約しました"}。事前アンケートの期限は${formatJpDate(
          presurveyDeadline({ date: slot.date })
        )}です。`
      );
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "予約できませんでした");
    } finally {
      setBusy("");
    }
  };

  const cancel = async (period: PeriodView) => {
    if (!period.myBooking) return;
    if (!confirm("この予約を取り消しますか？（枠は空きに戻ります）")) return;
    setBusy(period.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/one-on-one/booking", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: period.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error || "取り消せませんでした");
        return;
      }
      await load();
      void invalidateMySchedules();
      setMessage("予約を取り消しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消せませんでした");
    } finally {
      setBusy("");
    }
  };

  if (!data) {
    return <p className="py-16 text-center text-sm text-gray-500 animate-pulse">読み込んでいます…</p>;
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-gray-700">
        1on1の日程を自分で選べます。空いている枠から1つ選んでください（相手：院長）。
        予約・変更・取り消しができるのは<strong>実施日の{BOOKING_CHANGE_DAYS}日前まで</strong>です。
      </p>

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-booking-message>
          {message}{" "}
          <Link href="/one-on-one/presurvey" className="underline underline-offset-2">
            📝 事前アンケートに答える
          </Link>
        </p>
      )}
      {error && (
        <p
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700"
          role="alert"
          data-booking-error
        >
          {error}
        </p>
      )}

      {data.periods.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-600" data-booking-no-period>
          いまは予約できる期間がありません。院長が日程を作ると、ここに出ます。
        </p>
      ) : (
        data.periods.map((p) => {
          const b = p.myBooking;
          const dates = groupByDate(p.openSlots);
          return (
            <section
              key={p.id}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
              data-booking-period={p.id}
            >
              <h2 className="text-sm font-bold text-gray-900">🗓 {periodLabel(p)}</h2>

              {b ? (
                <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3" data-booking-mine>
                  <p className="text-sm text-gray-900">
                    あなたの1on1：
                    <span className="font-bold">
                      {formatDateW(b.date)} {b.startTime}〜{b.endTime}
                    </span>
                    　相手：院長
                  </p>
                  <p className="text-[11px] text-gray-600">
                    事前アンケートの期限は {formatJpDate(presurveyDeadline({ date: b.date }))} です。
                  </p>
                  {p.canChange ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-gray-600">
                        変更するときは下の空き枠を選んでください（{formatJpDate(p.changeDeadline)}まで）
                      </span>
                      <button
                        type="button"
                        onClick={() => void cancel(p)}
                        disabled={busy === p.id}
                        data-booking-cancel={p.id}
                        className="min-h-[44px] rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-700 disabled:opacity-50"
                      >
                        予約を取り消す
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium text-amber-800" data-booking-locked>
                      {BOOKING_LOCKED_MESSAGE}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" data-booking-please>
                  {BOOKING_PLEASE_MESSAGE}
                </p>
              )}

              {dates.length === 0 ? (
                <p className="text-sm text-gray-600" data-booking-none-left>
                  {b ? "いま選べる空き枠はありません。" : BOOKING_NONE_LEFT_MESSAGE}
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-gray-500">空いている枠から1つ選んでください</p>
                  {dates.map(({ date, items }) => (
                    <div key={date} className="space-y-1.5" data-booking-date={date}>
                      <p className="text-xs font-medium text-gray-700">{formatDateW(date)}</p>
                      <div className="flex flex-wrap gap-2">
                        {items.map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => setConfirming({ period: p, slot: s })}
                            disabled={busy === s.id}
                            data-booking-slot={s.id}
                            className="min-h-[44px] rounded-full border border-teal-300 bg-white px-4 py-2 text-sm text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                          >
                            {s.startTime}〜{s.endTime}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      {/* 確認（日時・相手） */}
      {confirming && (
        <div className="space-y-3 rounded-xl border-2 border-teal-300 bg-white p-4" data-booking-confirm>
          <p className="text-sm text-gray-900">
            この枠で予約します。
            <span className="ml-1 font-bold">
              {formatDateW(confirming.slot.date)} {confirming.slot.startTime}〜{confirming.slot.endTime}
            </span>
            　相手：院長
          </p>
          <p className="text-[11px] text-gray-600">
            事前アンケートの期限は {formatJpDate(presurveyDeadline({ date: confirming.slot.date }))} になります。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void book(confirming.period, confirming.slot)}
              disabled={busy === confirming.slot.id}
              data-booking-submit
              className="min-h-[44px] rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === confirming.slot.id ? "予約しています…" : "この枠で予約する"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="min-h-[44px] rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700"
            >
              やめる
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        <Link href="/one-on-one/presurvey" className="text-teal-700 underline underline-offset-2">
          📝 1on1の事前アンケートへ
        </Link>
      </p>
    </div>
  );
}

export default function BookingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <NavPageHeader
        navKey="/one-on-one/booking"
        title="🗓 1on1の予約"
        description="空いている枠から自分で選ぶ"
      />
      <FeatureGate feature="one_on_one_booking">
        <BookingPageBody />
      </FeatureGate>
    </div>
  );
}
