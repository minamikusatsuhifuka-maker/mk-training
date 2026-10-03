"use client";

// 管理画面のトップに出す「★ いま注力すること」の3件（指示書201 C-3）
//
// 中身は /api/admin/priority-matrix?focus=1 から取る。このAPIは院長のみで、
// 非管理者（委任された幹部を含む）には proxy が実在しないAPIと同じ応答を返す。
// よって**取れなかったときは何も出さない**（fail-close＝幹部の画面に枠だけ残らない）。

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FOCUS_MAX,
  QUADRANT_META,
  STATUS_LABEL,
  fetchFocusTasks,
  isOverdue,
  todayKey,
  type PriorityTask,
} from "@/lib/priority-matrix";

export function PriorityFocusMini() {
  const [tasks, setTasks] = useState<PriorityTask[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFocusTasks()
      .then((t) => {
        if (!cancelled) setTasks(t);
      })
      .catch(() => {
        /* 開けない人には何も出さない */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 読めなかった（＝院長でない）ときは枠ごと出さない
  if (tasks === null) return null;

  const today = todayKey();

  return (
    <section
      className="rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-2"
      data-pm-mini
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-amber-900">★ いま注力すること</h2>
        <Link
          href="/admin/priority-matrix"
          className="text-[11px] text-teal-700 underline underline-offset-2"
        >
          🧭 四象限マトリクスを開く
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="mt-1 text-[11px] text-amber-800">
          四象限マトリクスでタスクに★を付けると、ここに最大{FOCUS_MAX}件まで出ます。
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {tasks.map((t) => (
            <li key={t.id} data-pm-mini-item={t.id} className="text-xs text-slate-800">
              <span className="text-amber-500">★</span>{" "}
              <span className="text-[10px] text-slate-500">
                {QUADRANT_META[t.quadrant].short}
              </span>{" "}
              <span className="font-medium">{t.title}</span>{" "}
              <span
                className={`text-[10px] ${isOverdue(t, today) ? "font-bold text-rose-600" : "text-slate-500"}`}
              >
                {t.due ? t.due : "期限なし"}・{STATUS_LABEL[t.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
