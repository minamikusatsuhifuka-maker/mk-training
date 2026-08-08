"use client";

// ホームの滞留アラートカード（指示書154の要件9「ホームまたは該当ページのバッジ＋一覧」）
//
// 指名されたアカウント（＋管理者）にだけ描画する。許可されていないと probe が404を返すので
// 何も出さない＝機能の存在も知られない（ナビリンクと同じ流儀）。
// 滞留が0件のときもカードごと出さない（ホームを無駄に埋めない）。
//
// 表示するのは「種別◯件が◯日以上未完了」までで、**カルテ番号は出さない**。
// 詳細はボードを開いて確認する。

import { useEffect, useState } from "react";
import Link from "next/link";

export function DocTasksHomeAlert() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/doc-tasks?probe=1", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return; // 404＝許可されていない
        const j = (await r.json().catch(() => ({}))) as {
          staleCount?: number;
          alertLines?: string[];
        };
        if (cancelled) return;
        setCount(j.staleCount ?? 0);
        setLines(Array.isArray(j.alertLines) ? j.alertLines : []);
      })
      .catch(() => {
        /* 判定できないときは出さない（fail-close） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lines || lines.length === 0 || count === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <Link
        href="/doc-tasks"
        className="block rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100/70 transition-colors"
      >
        <p className="text-sm font-semibold text-red-800">
          🔔 書類の進捗で日数が経っているものがあります（{count}件）
        </p>
        <ul className="mt-1.5 space-y-1">
          {lines.map((line) => (
            <li key={line} className="text-xs text-red-800">
              ・{line}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-red-700 mt-2 underline underline-offset-2">
          書類進捗ボードを開く →
        </p>
      </Link>
    </section>
  );
}
