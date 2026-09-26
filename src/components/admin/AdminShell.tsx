"use client";

// 管理画面の共通シェル（ヘッダー＋サイドナビ）。
// 認可は src/app/admin/layout.tsx（サーバー側）と proxy.ts で行う。
// 183: 項目一覧の正本は lib/admin-items.ts。委任された幹部には指名された項目だけを出す（allowedKeys）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontSwitcher } from "@/components/FontSwitcher";
import { ADMIN_ITEMS } from "@/lib/admin-items";

// 項目一覧（表示順は lib/admin-items.ts の定義順）
const adminNav = ADMIN_ITEMS.map((i) => ({ key: i.key, label: i.label, href: i.href }));

export function AdminShell({
  children,
  isAdmin,
  allowedKeys,
}: {
  children: React.ReactNode;
  /** 183: app_metadata の管理者か（false＝委任された幹部） */
  isAdmin: boolean;
  /** 183: 出してよい項目key */
  allowedKeys: string[];
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // 149: メンバーノートは指名された人だけに見せる。
  // 許可されていないと probe が 404 を返すので、リンク自体を出さない（存在秘匿）。
  const [canSeeNotes, setCanSeeNotes] = useState(false);
  // 154: 書類進捗ボードも同じ流儀（指名された人だけ・probeが404ならリンクを出さない）
  const [canSeeDocTasks, setCanSeeDocTasks] = useState(false);
  // 169: スタッフ連絡先も同じ流儀（指名された人だけ・probeが404ならリンクを出さない）
  const [canSeeContacts, setCanSeeContacts] = useState(false);
  // 173: 院長の振り返り記録も同じ流儀（管理者だけ・probeが404ならリンクを出さない）
  const [canSeeRetro, setCanSeeRetro] = useState(false);
  // 179: スタッフ育成カルテも同じ流儀（管理者だけ・probeが404ならリンクを出さない）
  const [canSeeGrowth, setCanSeeGrowth] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const probe = (path: string, set: (ok: boolean) => void) =>
      fetch(path, { credentials: "same-origin" })
        .then((r) => {
          if (!cancelled) set(r.ok);
        })
        .catch(() => {
          /* 判定できないときは出さない（fail-close） */
        });
    probe("/api/member-notes?probe=1", setCanSeeNotes);
    probe("/api/doc-tasks?probe=1", setCanSeeDocTasks);
    probe("/api/staff-contacts?probe=1", setCanSeeContacts);
    probe("/api/director-retrospective?probe=1", setCanSeeRetro);
    probe("/api/growth/karte?probe=1", setCanSeeGrowth);
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = [
    ...adminNav.filter((i) => allowedKeys.includes(i.key)),
    ...(canSeeNotes
      ? [{ label: "📔 メンバーノート", href: "/member-notes" }]
      : []),
    ...(canSeeDocTasks
      ? [
          { label: "📋 書類進捗ボード", href: "/doc-tasks" },
          // 157: 設定はここから開く（実体は /doc-tasks/settings。
          //   /admin 配下だと未ログイン・非管理者に200が返り、ルートの存在が漏れるため）
          { label: "⚙️ 書類進捗ボードの設定", href: "/doc-tasks/settings" },
        ]
      : []),
    ...(canSeeContacts
      ? [
          { label: "📇 スタッフ連絡先", href: "/staff-contacts" },
          // 169: 設定はここから開く（実体は /staff-contacts/settings。
          //   /admin 配下だとルートの存在が漏れるため・157と同じ理由）
          { label: "⚙️ スタッフ連絡先の設定", href: "/staff-contacts/settings" },
        ]
      : []),
    ...(canSeeRetro
      ? [{ label: "🧭 院長の振り返り記録", href: "/director-retrospective" }]
      : []),
    ...(canSeeGrowth
      ? [
          { label: "📗 スタッフ育成カルテ", href: "/staff-growth" },
          // 179: 講座マスタ・設定はここから開く（/admin 配下だとルートの存在が漏れるため・157と同じ理由）。
          // 183: 講座マスタ（AI下書きの設定を含む）は院長のみ
          ...(isAdmin ? [{ label: "🗂 講座マスタ・AI下書き設定", href: "/staff-growth/courses" }] : []),
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-800 text-white px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-xl"
          >
            ☰
          </button>
          <span className="text-base md:text-lg font-bold">南草津皮フ科 管理画面</span>
        </div>
        <div className="flex items-center gap-4">
          {/* フォント切り替え（139・デスクトップのみ。モバイルは☰内） */}
          <div className="hidden md:block w-[230px]">
            <FontSwitcher dark showLabel={false} />
          </div>
          <Link
            href="/"
            className="text-xs md:text-sm text-slate-300 hover:text-white transition-colors"
          >
            ← スタッフ画面
          </Link>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-slate-700 px-4 py-2 space-y-1">
          {/* フォント切り替え（139・モバイル管理画面用） */}
          <div className="py-1.5">
            <FontSwitcher dark />
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-slate-500 text-white font-medium"
                    : "text-slate-300 hover:bg-slate-600 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-[200px] shrink-0 bg-slate-800 min-h-[calc(100vh-52px)] px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-slate-600 text-white font-medium"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-3 md:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
