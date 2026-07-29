"use client";

// 🗓 院内カレンダー（指示書114・機能ID calendar）— 10機能シリーズ最終
// - 予定の源泉は Google カレンダー（管理はGoogle側で直接・ポータル側に管理UIは作らない）。
// - 取得は認証付き /api/calendar のみ（60日先までのリスト・月間グリッドは作らない）。
// - env未設定・接続失敗はスタッフに「準備中」の穏やかな表示。管理者にのみ詳細
//   （detail はサーバー側 isAdminUser 判定で応答に含まれる。クライアントは有無だけ見る）。

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";

type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO日時（終日は "YYYY-MM-DD"）
  end: string;
  allDay: boolean;
  location: string;
};

type LoadState = "loading" | "ready" | "unauthenticated" | "unavailable";

const CALENDAR_INTRO =
  "勉強会・研修・院内イベントなどの予定です。予定の追加・変更はGoogleカレンダーで行われます。";
const CALENDAR_EMPTY = "今後60日間の予定はありません。";
const CALENDAR_PREPARING =
  "カレンダーは準備中です。もうすこしお待ちください。";

// 予定のJST暦日（"YYYY-MM-DD"）。終日はそのまま・時刻ありは jstTodayYmd に日時を渡して変換
function jstYmdOf(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(start);
  if (isNaN(d.getTime())) return start;
  return jstTodayYmd(d);
}

// 日付見出し「7/29（水）」（JST基準・TZ非依存: ymd文字列からUTC構築で曜日算出）
function formatDayHeading(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, da] = m;
  const week = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da))).getUTCDay()
  ];
  return `${Number(mo)}/${Number(da)}（${week}）`;
}

// 時刻表示「10:00〜11:30」（JST固定・閲覧環境のTZに依存させない）
function formatTimeRange(ev: CalendarEvent): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    });
  };
  const s = fmt(ev.start);
  const e = fmt(ev.end);
  if (!s) return "";
  return e ? `${s}〜${e}` : s;
}

function CalendarPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [adminDetail, setAdminDetail] = useState("");
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async (isReload: boolean) => {
    if (isReload) setReloading(true);
    try {
      const res = await fetch("/api/calendar", { cache: "no-store" });
      if (res.status === 401) {
        setState("unauthenticated");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          detail?: string;
        };
        setAdminDetail(typeof j.detail === "string" ? j.detail : "");
        setState("unavailable");
        return;
      }
      const j = (await res.json()) as { events?: CalendarEvent[] };
      setEvents(Array.isArray(j.events) ? j.events : []);
      setState("ready");
    } catch {
      setAdminDetail("");
      setState("unavailable");
    } finally {
      if (isReload) setReloading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

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
          カレンダーの閲覧にはログインが必要です。
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

  if (state === "unavailable") {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-gray-600">{CALENDAR_PREPARING}</p>
        {adminDetail && (
          <div className="text-left max-w-xl mx-auto space-y-2">
            <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 break-all whitespace-pre-wrap">
              【管理者向け】{adminDetail}
            </p>
            <p className="text-xs text-gray-500">
              設定手順書（GCP設定手順書）をご確認ください。
            </p>
          </div>
        )}
      </div>
    );
  }

  // 日付（JST）でグループ化。API側で開始時刻順のため、日付キーの出現順で安定
  const groups: { ymd: string; items: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const ymd = jstYmdOf(ev.start);
    const last = groups[groups.length - 1];
    if (last && last.ymd === ymd) {
      last.items.push(ev);
    } else {
      groups.push({ ymd, items: [ev] });
    }
  }
  const today = jstTodayYmd();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3 flex-1 min-w-[240px]">
          {CALENDAR_INTRO}
        </p>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={reloading}
          className="text-sm px-3 py-2 border border-gray-200 rounded-full hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          {reloading ? "更新中…" : "🔄 再読み込み"}
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-12">
          {CALENDAR_EMPTY}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section
              key={g.ymd}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
            >
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                {formatDayHeading(g.ymd)}
                {g.ymd === today && (
                  <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">
                    今日
                  </span>
                )}
              </h2>
              <ul className="space-y-1.5">
                {g.items.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 rounded-lg bg-gray-50/60 border border-gray-100 px-3 py-2"
                  >
                    {ev.allDay ? (
                      <span className="text-[10px] font-medium bg-sky-100 text-sky-800 rounded-full px-2 py-0.5 shrink-0 mt-0.5">
                        終日
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600 tabular-nums shrink-0 mt-0.5 w-24">
                        {formatTimeRange(ev)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 break-words">
                        {ev.title}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-gray-500 break-words">
                          📍 {ev.location}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="🗓 院内カレンダー"
        description="勉強会・イベントの予定共有"
      />
      <FeatureGate feature="calendar">
        <CalendarPageBody />
      </FeatureGate>
    </div>
  );
}
