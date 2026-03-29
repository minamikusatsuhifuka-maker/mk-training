"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminNav = [
  { label: "📊 ダッシュボード", href: "/admin" },
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
  { label: "📝 更新履歴", href: "/admin/changelog" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
        <Link
          href="/"
          className="text-xs md:text-sm text-slate-300 hover:text-white transition-colors"
        >
          ← スタッフ画面
        </Link>
      </header>

      {/* Mobile nav dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-slate-700 px-4 py-2 space-y-1">
          {adminNav.map((item) => {
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
            {adminNav.map((item) => {
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
