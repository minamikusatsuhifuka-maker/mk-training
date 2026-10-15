"use client";

// 任された人（指名された人・管理者）にだけ出る項目（262で1つにまとめた）
//
// 📋 書類進捗（154）・📘 欲求別成長支援ガイド／🎓 人材育成研修（254）・📇 スタッフ連絡先（169）・
// 🧭 院長の振り返り記録（173）・🌱 可能性ノート（179）。
// 見られるかどうかは今までどおり各機能のサーバーの判定（probe）。許可されていないと 404 なので出さない。
// 判定できないときも出さない（fail-close）。
//
// 262: 管理画面「🧭 サイドバー構成」でグループへ移せるようにした。置き場所が変わっても、判定はここで同じものを使う。
//   グループに置かれていないものは、今までどおり左のメニューのいちばん下に出る。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { gatedKeysOutsideGroups, type ResolvedCategory } from "@/lib/nav";

/** 項目ごとの判定の結果。無い＝出さない。docTasks はバッジ（滞留件数）つき */
export type GatedAccess = Partial<Record<string, { badge?: number }>>;

async function probeOk(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    return r.ok ? r : null; // 404＝許可されていない → 出さない
  } catch {
    return null; // 判定できないときは出さない（fail-close）
  }
}

/** 6つの項目の判定をまとめて取る（判定はサーバー。今までの各リンクと同じ probe） */
export function useGatedAccess(): GatedAccess {
  const [access, setAccess] = useState<GatedAccess>({});

  useEffect(() => {
    let cancelled = false;
    const set = (patch: GatedAccess) => {
      if (!cancelled) setAccess((a) => ({ ...a, ...patch }));
    };
    probeOk("/api/doc-tasks?probe=1").then(async (r) => {
      if (!r) return;
      const j = (await r.json().catch(() => ({}))) as { staleCount?: number };
      set({ "/doc-tasks": { badge: j.staleCount ?? 0 } });
    });
    probeOk("/api/admin/people-training?probe=1").then(async (r) => {
      if (!r) return;
      const j = (await r.json().catch(() => ({}))) as { guide?: boolean; training?: boolean };
      set({
        ...(j.guide === true ? { "/admin/people-training/guide": {} } : {}),
        ...(j.training === true ? { "/admin/people-training": {} } : {}),
      });
    });
    probeOk("/api/staff-contacts?probe=1").then((r) => r && set({ "/staff-contacts": {} }));
    probeOk("/api/director-retrospective?probe=1").then((r) => r && set({ "/director-retrospective": {} }));
    probeOk("/api/growth/karte?probe=1").then((r) => r && set({ "/staff-growth": {} }));
    return () => {
      cancelled = true;
    };
  }, []);

  return access;
}

/** 1つの項目のリンク。許可されていない項目には呼ばない（呼び出し側が access で絞る） */
export function GatedNavLink({
  item,
  badge,
  variant,
  onNavigate,
}: {
  item: { key: string; href: string; label: string };
  badge?: number;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // 🌱 可能性ノートは、ひとりずつのページ（/staff-growth/<id>）を開いているときも光らせる（今までどおり）
  const isActive =
    pathname === item.href || (item.key === "/staff-growth" && pathname.startsWith(`${item.href}/`));
  const base =
    variant === "sidebar"
      ? "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
      : "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm min-h-[44px] transition-colors";
  const tone = isActive ? "bg-teal-light text-teal font-medium" : "text-foreground hover:bg-accent";

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`${base} ${tone}`}
      data-gated-link={item.key}
    >
      <span>{item.label}</span>
      {!!badge && badge > 0 && (
        <span className="shrink-0 rounded-full bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

/**
 * 左のメニューに出すグループと、いちばん下に出す項目を、見る人の判定で絞る（PCのサイドバーとスマートフォンの引き出しで共用）。
 * - グループの中の「任された人にだけ出る項目」は、許可された人にだけ残す
 * - 中身が空になったグループは出さない
 */
export function filterNavForViewer(resolved: ResolvedCategory[], access: GatedAccess) {
  const sections = resolved
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.gated || !!access[it.key]) }))
    .filter((s) => s.items.length > 0);
  const bottom = gatedKeysOutsideGroups(resolved).filter((g) => !!access[g.key]);
  return { sections, bottom };
}
