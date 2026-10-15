"use client";

// 「📘 欲求別成長支援ガイド」「🎓 人材育成研修」への導線（指示書254）
//
// 任された人（院長が「🔑 委任の設定」で人材育成研修を任せた幹部）と院長にだけ、左のメニューに出す。
// ほかの任された機能（📋 書類進捗・🌱 可能性ノート）と同じ置き場所・同じ流儀：
//   判定はサーバー（/api/admin/people-training?probe=1）。許可されていないと 404 なのでリンク自体を描かない。
//   判定できないときも出さない（fail-close）。開く先は今までどおり管理画面の中のページ（判定もそのまま）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GUIDE = { href: "/admin/people-training/guide", label: "📘 欲求別成長支援ガイド" };
const TRAINING = { href: "/admin/people-training", label: "🎓 人材育成研修" };

export function PeopleTrainingNavLinks({ variant, onNavigate }: { variant: "sidebar" | "drawer"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [state, setState] = useState<{ guide: boolean; training: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/people-training?probe=1", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return; // 404＝任されていない → 何も出さない
        const j = (await r.json().catch(() => ({}))) as { guide?: boolean; training?: boolean };
        if (!cancelled) setState({ guide: j.guide === true, training: j.training === true });
      })
      .catch(() => {
        /* 判定できないときは出さない（fail-close） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const base =
    variant === "sidebar"
      ? "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
      : "flex items-center gap-2 rounded-md px-2 py-2 text-sm min-h-[44px] transition-colors";
  const tone = (href: string) => (pathname === href ? "bg-teal-light text-teal font-medium" : "text-foreground hover:bg-accent");
  const links = [state.guide ? GUIDE : null, state.training ? TRAINING : null].filter((x): x is typeof GUIDE => x !== null);

  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} onClick={onNavigate} className={`${base} ${tone(l.href)}`} data-people-training-link={l.href}>
          <span>{l.label}</span>
        </Link>
      ))}
    </>
  );
}
