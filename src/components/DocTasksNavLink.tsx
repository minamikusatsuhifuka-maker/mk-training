"use client";

// 書類進捗ボードへの導線（指示書154 / 154-2）
//
// 指名されたアカウント（＋管理者）にだけリンクを出す。
// 許可されていないと probe が 404 を返すので、リンク自体を描画しない（存在秘匿・149と同じ流儀）。
// 判定できないときも出さない（fail-close）。
//
// バッジ＝滞留件数（アプリ内アラート）。件数だけで、カルテ番号などの明細は載せない。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const HREF = "/doc-tasks";
const LABEL = "📋 書類進捗";

export function DocTasksNavLink({
  variant,
  onNavigate,
}: {
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<{ staleCount: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/doc-tasks?probe=1`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return; // 404＝許可されていない → 何も出さない
        const j = (await r.json().catch(() => ({}))) as { staleCount?: number };
        if (!cancelled) setState({ staleCount: j.staleCount ?? 0 });
      })
      .catch(() => {
        /* 判定できないときは出さない（fail-close） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const isActive = pathname === HREF;
  const base =
    variant === "sidebar"
      ? "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
      : "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm min-h-[44px] transition-colors";
  const tone = isActive
    ? "bg-teal-light text-teal font-medium"
    : "text-foreground hover:bg-accent";

  return (
    <Link href={HREF} onClick={onNavigate} className={`${base} ${tone}`}>
      <span>{LABEL}</span>
      {state.staleCount > 0 && (
        <span className="shrink-0 rounded-full bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
          {state.staleCount}
        </span>
      )}
    </Link>
  );
}
