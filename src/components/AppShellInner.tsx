"use client";

// サイドバー・モバイルヘッダ・ドロワー本体（指示書161で AppShell から分離）
//
// 【なぜ分けたか】
// ここは useResolvedNav()＝**機能一覧（メニュー定義）** を読み込む。
// 以前は AppShell 本体に置いていたため、ログイン画面でも同じチャンクが配られ、
// 未ログインの人がダウンロードしたJSの中に全機能の名前が入っていた
// （指示書161 4-3「サイドメニュー（機能一覧）は出さない」に反する）。
// この階層を dynamic import に切り出すことで、/login と /reset-password では
// このチャンク自体が要求されない。

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { useResolvedNav } from "@/lib/use-nav";
import { UserMenu } from "@/components/UserMenu";
import { AdminOnly } from "@/components/AdminOnly";
import { FontSwitcher } from "@/components/FontSwitcher";
import { DocTasksNavLink } from "@/components/DocTasksNavLink";
import { StaffContactsNavLink } from "@/components/StaffContactsNavLink";
import { useSidebarAccordion } from "@/lib/sidebar-accordion";

export default function AppShellInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileNavSections = useResolvedNav().filter((s) => s.items.length > 0);
  // 166: カテゴリの開閉（デスクトップのサイドバーと同じ設定・記憶を共有）
  const { isOpen, toggle } = useSidebarAccordion(mobileNavSections, pathname);

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile header + drawer */}
      {/* min-w-0: flex項目のmin-width:autoが子の内在幅で最小幅を張るのを防ぐ（指示書92）。
          これが無いと歩みグラフ等の幅広コンテンツが狭画面でviewportを超えて膨張し、
          body{overflow-x:hidden}に右端を切られてスクロールで末尾に到達できなくなる。 */}
      <div className="flex-1 min-w-0 min-h-screen flex flex-col">
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
                    <button
                      type="button"
                      onClick={() => toggle(section.id)}
                      aria-expanded={isOpen(section.id)}
                      className="w-full flex items-center justify-between px-2 mb-1 min-h-[44px] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      <span>{section.label}</span>
                      <span aria-hidden="true">{isOpen(section.id) ? "▾" : "▸"}</span>
                    </button>
                    {isOpen(section.id) && (
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
                    )}
                  </div>
                ))}

                {/* 書類進捗ボード（154）。指名された人にだけ出る */}
                <DocTasksNavLink
                  variant="drawer"
                  onNavigate={() => setMenuOpen(false)}
                />

                {/* スタッフ連絡先（169）。指名された人にだけ出る */}
                <StaffContactsNavLink
                  variant="drawer"
                  onNavigate={() => setMenuOpen(false)}
                />
              </nav>
              <div className="px-3 py-2.5 border-t">
                <FontSwitcher />
              </div>
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

        <main className="flex-1 min-w-0 overflow-y-auto p-3 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
