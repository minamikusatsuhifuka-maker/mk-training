"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const navSections = [
  {
    title: "医療知識",
    items: [
      { label: "疾患", href: "/diseases" },
      { label: "薬剤", href: "/drugs" },
      { label: "禁忌・注意", href: "/contraindications" },
    ],
  },
  {
    title: "当院の美容",
    items: [
      { label: "美容メニュー", href: "/cosmetic" },
      { label: "スキンケア", href: "/skincare" },
    ],
  },
  {
    title: "業務・接遇",
    items: [
      { label: "受付", href: "/reception" },
      { label: "事務", href: "/clerk" },
      { label: "カウンセラー", href: "/counselor" },
    ],
  },
  {
    title: "確認テスト",
    items: [{ label: "クイズ", href: "/quiz" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

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
            <div key={section.title}>
              <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-teal-light text-teal font-medium"
                            : "text-foreground/70 hover:bg-accent hover:text-foreground"
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
        </nav>
      </ScrollArea>
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
    </aside>
  );
}
