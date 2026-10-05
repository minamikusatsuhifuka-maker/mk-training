"use client";

import Link from "next/link";
import { PresurveyNavMark } from "@/components/OneOnOneSchedule";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useResolvedNav } from "@/lib/use-nav";
import { UserMenu } from "@/components/UserMenu";
import { AdminAreaLink } from "@/components/AdminAreaLink";
import { FontSwitcher } from "@/components/FontSwitcher";
import { DocTasksNavLink } from "@/components/DocTasksNavLink";
import { StaffContactsNavLink } from "@/components/StaffContactsNavLink";
import { DirectorRetrospectiveNavLink } from "@/components/DirectorRetrospectiveNavLink";
import { StaffGrowthNavLink } from "@/components/StaffGrowthNavLink";
import { useSidebarAccordion } from "@/lib/sidebar-accordion";
/**
 * 203（院長の返答）: 保存された設定では「準備中」で、院長・検証用アカウントだけが
 * プレビューで開けている項目に付ける小さな印。スタッフにはそもそも項目が出ない。
 */
function PreviewMark({ on }: { on?: true }) {
  if (!on) return null;
  return (
    <span
      className="ml-1 shrink-0 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 align-middle"
      data-nav-preview
      title="準備中：スタッフには表示されていません"
    >
      準備中
    </span>
  );
}


export function Sidebar() {
  const pathname = usePathname();
  const navSections = useResolvedNav().filter((s) => s.items.length > 0);
  // 166: カテゴリの開閉。既定の開閉は管理画面「サイドバー構成」の設定（未設定は全開＝従来どおり）
  const { isOpen, toggle } = useSidebarAccordion(navSections, pathname);

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
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen(section.id)}
                className="w-full flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{section.label}</span>
                <span aria-hidden="true">{isOpen(section.id) ? "▾" : "▸"}</span>
              </button>
              {isOpen(section.id) && (
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  // 外部リンクは別タブで開く（現在ページのハイライトは不要）。指示書59
                  // 171: メニューに並ぶと「アプリの一機能」に見えるため、↗ で外部サイトだと分かるようにする
                  if (item.external) {
                    return (
                      <li key={item.key}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${item.label}（外部サイト・新しいタブで開きます）`}
                          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors text-foreground hover:bg-accent"
                        >
                          <span className="min-w-0 truncate">{item.label}</span>
                          <PreviewMark on={item.preview} />
                          <span aria-hidden="true" className="shrink-0 text-[11px] text-muted-foreground">↗</span>
                          <span className="sr-only">（外部サイト・新しいタブで開きます）</span>
                        </a>
                      </li>
                    );
                  }
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-teal-light text-teal font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        {item.label}
                        <PreviewMark on={item.preview} />
                        <PresurveyNavMark href={item.href} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          ))}

          {/* 書類進捗ボード（154）。指名された人にだけ出る（未許可には描画されない） */}
          <DocTasksNavLink variant="sidebar" />

          {/* スタッフ連絡先（169）。指名された人にだけ出る（未許可には描画されない） */}
          <StaffContactsNavLink variant="sidebar" />

          {/* 院長の振り返り記録（173）。管理者にだけ出る（未許可には描画されない） */}
          <DirectorRetrospectiveNavLink variant="sidebar" />

          {/* スタッフ育成カルテ（179）。管理者にだけ出る（未許可には描画されない） */}
          <StaffGrowthNavLink variant="sidebar" />
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
      <AdminAreaLink>
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
      </AdminAreaLink>
    </aside>
  );
}
