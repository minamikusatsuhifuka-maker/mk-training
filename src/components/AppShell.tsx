"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { useResolvedNav } from "@/lib/use-nav";
import { UserMenu } from "@/components/UserMenu";
import { AdminOnly } from "@/components/AdminOnly";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileNavSections = useResolvedNav().filter((s) => s.items.length > 0);
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname === "/login" || pathname === "/reset-password";

  if (isAdmin || isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile header + drawer */}
      <div className="flex-1 min-h-screen flex flex-col">
        <header className="md:hidden bg-teal text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
          <button type="button" onClick={() => setMenuOpen(true)} className="text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
            ☰
          </button>
          <Link href="/" className="font-bold text-sm">南草津皮フ科 スタッフ研修</Link>
          <div className="w-[44px]" />
        </header>

        {/* Mobile overlay */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="w-[260px] bg-white h-full overflow-y-auto shadow-xl">
              <div className="px-4 py-5 border-b">
                <h1 className="text-lg font-bold text-teal">南草津皮フ科</h1>
                <p className="text-xs text-muted-foreground">スタッフ研修</p>
              </div>
              <nav className="px-3 py-4 space-y-4">
                {mobileNavSections.map((section) => (
                  <div key={section.id}>
                    <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</p>
                    <ul className="space-y-0.5">
                      {section.items.map((item) => (
                        <li key={item.href}>
                          {item.external ? (
                            // 外部リンクは別タブで開く（指示書59）
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setMenuOpen(false)}
                              className="rounded-md px-2 py-2 text-sm min-h-[44px] flex items-center transition-colors text-foreground hover:bg-accent"
                            >
                              {item.label}
                            </a>
                          ) : (
                            <Link
                              href={item.href}
                              onClick={() => setMenuOpen(false)}
                              className={`block rounded-md px-2 py-2 text-sm min-h-[44px] flex items-center transition-colors ${
                                pathname === item.href
                                  ? "bg-teal-light text-teal font-medium"
                                  : "text-foreground hover:bg-accent"
                              }`}
                            >
                              {item.label}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
              <div className="px-3 py-2 border-t">
                <UserMenu onNavigate={() => setMenuOpen(false)} />
              </div>
              <AdminOnly>
                <div className="px-3 py-3 border-t">
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground hover:text-foreground">
                    <span>⚙</span><span>管理画面</span>
                  </Link>
                </div>
              </AdminOnly>
            </div>
            <div className="flex-1 bg-black/30" onClick={() => setMenuOpen(false)} />
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
