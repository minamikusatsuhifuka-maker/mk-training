"use client";

// スタッフ連絡先への導線（指示書169）
//
// 指名されたアカウント（＋管理者）にだけリンクを出す。
// 許可されていないと probe が 404 を返すので、リンク自体を描画しない（存在秘匿・154と同じ流儀）。
// 判定できないときも出さない（fail-close）。
//
// バッジは出さない（件数も知らせない）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const HREF = "/staff-contacts";
const LABEL = "📇 スタッフ連絡先";

export function StaffContactsNavLink({
  variant,
  onNavigate,
}: {
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/staff-contacts?probe=1`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((r) => {
        if (r.ok && !cancelled) setVisible(true); // 404＝許可されていない → 何も出さない
      })
      .catch(() => {
        /* 判定できないときは出さない（fail-close） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const isActive = pathname === HREF;
  const base =
    variant === "sidebar"
      ? "block rounded-md px-2 py-1.5 text-sm transition-colors"
      : "block rounded-md px-2 py-2 text-sm min-h-[44px] transition-colors";
  const tone = isActive
    ? "bg-teal-light text-teal font-medium"
    : "text-foreground hover:bg-accent";

  return (
    <Link href={HREF} onClick={onNavigate} className={`${base} ${tone}`}>
      {LABEL}
    </Link>
  );
}
