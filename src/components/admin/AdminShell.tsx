"use client";

// 管理画面の共通シェル（ヘッダー＋サイドナビ）。
// 認可（管理者のみ）は src/app/admin/layout.tsx（サーバー側）で行う。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontSwitcher } from "@/components/FontSwitcher";

const adminNav = [
  { label: "📊 ダッシュボード", href: "/admin" },
  { label: "🏠 ポータル管理", href: "/admin/portal" },
  { label: "🧭 サイドバー構成", href: "/admin/nav" },
  { label: "🏛️ 組織知識ベース管理", href: "/admin/knowledge-system" },
  { label: "🧭 背景情報・理念管理", href: "/admin/ai-background" },
  { label: "📚 知識ベース管理", href: "/admin/knowledge" },
  { label: "🦠 疾患管理", href: "/admin/diseases" },
  { label: "💊 薬剤管理", href: "/admin/drugs" },
  { label: "❓ クイズ管理", href: "/admin/quiz" },
  { label: "⚠️ 禁忌管理", href: "/admin/contraindications" },
  { label: "💬 カウンセリング管理", href: "/admin/counseling" },
  { label: "✨ 美容施術管理", href: "/admin/cosmetic" },
  { label: "🧴 スキンケア管理", href: "/admin/skincare" },
  { label: "🤰 妊娠授乳管理", href: "/admin/pregnancy" },
  { label: "⚡ 相互作用管理", href: "/admin/interactions" },
  { label: "💴 算定点数管理", href: "/admin/medical-fees" },
  { label: "📋 業務チェック管理", href: "/admin/operations" },
  { label: "👥 スタッフ名簿", href: "/admin/staff-members" },
  { label: "🏷️ タスクカテゴリ管理", href: "/admin/task-categories" },
  { label: "👤 アカウント招待", href: "/admin/staff-accounts" },
  { label: "🪪 プロフィール項目管理", href: "/admin/profile-fields" },
  { label: "💉 生物学的製剤管理", href: "/admin/biologics" },
  { label: "⭐ エキスパート要件管理", href: "/admin/expert" },
  { label: "🔬 ディープリサーチ", href: "/admin/deep-research" },
  { label: "📝 更新履歴", href: "/admin/changelog" },
  { label: "⚙️ AI設定", href: "/admin/settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // 149: メンバーノートは指名された人だけに見せる。
  // 許可されていないと probe が 404 を返すので、リンク自体を出さない（存在秘匿）。
  const [canSeeNotes, setCanSeeNotes] = useState(false);
  // 154: 書類進捗ボードも同じ流儀（指名された人だけ・probeが404ならリンクを出さない）
  const [canSeeDocTasks, setCanSeeDocTasks] = useState(false);
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
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = [
    ...adminNav,
    ...(canSeeNotes
      ? [{ label: "📔 メンバーノート", href: "/member-notes" }]
      : []),
    ...(canSeeDocTasks
      ? [
          { label: "📋 書類進捗ボード", href: "/doc-tasks" },
          // 157: 設定は管理画面側に移設（開ける人・滞留日数・主治医・アラートの送信先）
          { label: "⚙️ 書類進捗ボードの設定", href: "/admin/doc-tasks" },
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
