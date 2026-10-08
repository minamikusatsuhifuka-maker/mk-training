"use client";

// 管理画面のトップに出す「毎朝8時の定時処理 前回の結果」（指示書219 §2）
//
// 中身は /api/admin/cron-status から取る。このAPIは**院長のみ**で、委任された幹部には
// proxy が実在しないAPIと同じ応答を返す。よって**取れなかったときは何も出さない**
// （fail-close＝幹部の画面に枠だけ残らない。201のPriorityFocusMiniと同じ流儀）。
//
// 赤い帯を出すのは次の2つ（219 §2）
//   ・失敗した
//   ・前回の実行から26時間以上たっている（鍵の不一致などで呼ばれず、記録すら残らない場合に気づけるように）

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CRON_JOBS,
  CRON_RESULT_LABEL,
  CRON_STALE_HOURS,
  formatRunAt,
  isCronStale,
  needsAttention,
  normalizeCronRecord,
  type CronJobKey,
  type CronRunRecord,
} from "@/lib/cron-status";

type Run = { job: CronJobKey; record: CronRunRecord | null };

const TONE: Record<string, string> = {
  sent: "text-teal-800",
  nothing: "text-gray-600",
  already: "text-gray-600",
  mail_off: "text-amber-800",
  failed: "text-red-700",
};

export function CronStatusCard() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/cron-status", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { runs?: unknown; now?: unknown };
      })
      .then((j) => {
        if (cancelled) return;
        const list = Array.isArray(j.runs) ? j.runs : [];
        setRuns(
          list.map((r) => {
            const o = (r ?? {}) as { job?: unknown; record?: unknown };
            return {
              job: (o.job === "presurvey-alert" ? "presurvey-alert" : "doc-tasks-alert") as CronJobKey,
              record: normalizeCronRecord(o.record),
            };
          })
        );
        // 「26時間たったか」はサーバーの時刻で測る（端末の時計がずれていても正しく出す）
        setNow(typeof j.now === "string" ? Date.parse(j.now) || Date.now() : Date.now());
      })
      .catch(() => {
        /* 開けない人には何も出さない */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 読めなかった（＝院長でない）ときは枠ごと出さない
  if (runs === null) return null;

  const alert = runs.some((r) => needsAttention(r.record, now));

  return (
    <section
      className={`rounded-xl border px-3 py-2 ${
        alert ? "border-red-300 bg-red-50/70" : "border-slate-200 bg-white"
      }`}
      data-cron-status-card
      data-cron-alert={alert ? "1" : "0"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="text-sm font-bold text-slate-800">🕗 毎朝8時の定時処理　前回の結果</h2>
        <p className="text-[11px] text-slate-500">
          毎日 朝8時（日本時間）に自動で動きます。送った件数だけを記録しています。
        </p>
      </div>

      {alert && (
        <p className="mt-1 rounded-lg bg-red-100 border border-red-300 px-2 py-1 text-[12px] font-medium text-red-800" data-cron-alert-banner>
          ⚠ 確かめてください（失敗した、または{CRON_STALE_HOURS}時間以上動いた記録がありません）
        </p>
      )}

      <ul className="mt-1.5 divide-y divide-slate-100">
        {runs.map((r) => {
          const job = CRON_JOBS.find((j) => j.key === r.job);
          const rec = r.record;
          const stale = !rec || isCronStale(rec.at, now);
          return (
            <li key={r.job} className="py-1.5" data-cron-row={r.job}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium text-slate-800">{job?.label ?? r.job}</span>
                <span className={`text-[12px] ${rec ? TONE[rec.result] : "text-red-700"}`} data-cron-result={r.job}>
                  {rec ? CRON_RESULT_LABEL[rec.result] : "記録なし"}
                </span>
                {rec && (rec.sent > 0 || rec.failed > 0) && (
                  <span className="text-[11px] text-slate-600 tabular-nums">
                    送信 {rec.sent}件{rec.failed > 0 && ` ・ 失敗 ${rec.failed}件`}
                  </span>
                )}
                <span className={`text-[11px] ${stale ? "text-red-700 font-medium" : "text-slate-500"}`}>
                  {rec ? formatRunAt(rec.at) : "まだ一度も動いていません"}
                </span>
                {job?.href && (
                  <Link href={job.href} className="text-[11px] text-teal-800 underline underline-offset-2">
                    {job.hrefLabel}
                  </Link>
                )}
              </div>
              {rec && (
                <p className="text-[11px] text-slate-600 leading-snug">
                  {rec.parts.length > 0
                    ? rec.parts.map((p) => `${p.label}: ${p.reason}`).join(" ／ ")
                    : rec.reason}
                </p>
              )}
              {rec?.error && (
                <p className="text-[11px] text-red-700 leading-snug" data-cron-error={r.job}>
                  {rec.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
