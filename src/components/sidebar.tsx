"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useResolvedNav } from "@/lib/use-nav";
import { UserMenu } from "@/components/UserMenu";
import { AdminOnly } from "@/components/AdminOnly";
import { FontSwitcher } from "@/components/FontSwitcher";
import { DocTasksNavLink } from "@/components/DocTasksNavLink";

export function Sidebar() {
  const pathname = usePathname();
  const navSections = useResolvedNav().filter((s) => s.items.length > 0);

  return (
    <aside className="w-[220px] shrink-0 border-r border-border bg-[var(--sidebar)] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-6">
        <Link href="/" className="block">
          <h1 className="text-lg font-bold text-teal">南草津皮フ科</h1>
          <p className="text-xs text-muted-foreground mt-0.5">スタッフ研修</p>
        </Link>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-5">
          {navSections.map((section) => (
            <div key={section.id}>
              <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  // 外部リンクは別タブで開く（現在ページのハイライトは不要）。指示書59
                  if (item.external) {
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md px-2 py-1.5 text-sm transition-colors text-foreground hover:bg-accent"
                        >
                          {item.label}
                        </a>
                      </li>
                    );
                  }
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-teal-light text-teal font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* 書類進捗ボード（154）。指名された人にだけ出る（未許可には描画されない） */}
          <DocTasksNavLink variant="sidebar" />
        </nav>
      </ScrollArea>

      {/* フォント切り替え（139） */}
      <Separator />
      <div className="px-3 py-2.5">
        <FontSwitcher />
      </div>

      {/* ログイン状態 */}
      <Separator />
      <div className="px-3 py-2">
        <UserMenu />
      </div>

      {/* Admin link（管理者ログイン中のみ表示） */}
      <AdminOnly>
        <Separator />
        <div className="px-3 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span>⚙</span>
            <span>管理画面</span>
          </Link>
        </div>
      </AdminOnly>
    </aside>
  );
}
