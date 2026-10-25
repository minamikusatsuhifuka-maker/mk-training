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
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { useNavPending } from "@/components/NavFeedback";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { PresurveyNavMark } from "@/components/OneOnOneSchedule";
import { NoticesNavMark } from "@/components/notices/NoticesAlerts";
import { Sidebar } from "@/components/sidebar";
import { useResolvedNav } from "@/lib/use-nav";
import { UserMenu } from "@/components/UserMenu";
import { AdminAreaLink } from "@/components/AdminAreaLink";
import { FontSwitcher } from "@/components/FontSwitcher";
import { GatedNavLink, filterNavForViewer, useGatedAccess } from "@/components/GatedNavLinks";
import type { ResolvedCategory } from "@/lib/nav";
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


export default function AppShellInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const resolvedNav = useResolvedNav();
  // 速度: 押した瞬間にスケルトンへ切り替える（メニューのリンクの先読みは next/link の標準＝見えたとき・カーソルを合わせたとき）
  const navPending = useNavPending();

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
              <DrawerNav resolved={resolvedNav} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
              <div className="px-3 py-2.5 border-t">
                <FontSwitcher />
              </div>
              <div className="px-3 py-2 border-t">
                <UserMenu onNavigate={() => setMenuOpen(false)} />
              </div>
              <AdminAreaLink>
                <div className="px-3 py-3 border-t">
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground hover:text-foreground">
                    <span>⚙</span><span>管理画面</span>
                  </Link>
                </div>
              </AdminAreaLink>
            </div>
            <div className="flex-1 bg-black/30" onClick={() => setMenuOpen(false)} />
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto p-3 md:p-6">
          {/* 切り替え中は中身を隠して（消さずに残す）スケルトンを出す。新しい画面になったら戻る */}
          {navPending && <RouteSkeleton />}
          <div style={{ display: navPending ? "none" : "contents" }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * スマートフォンのメニューの引き出し（262でPCのサイドバーと同じ並び・同じ判定にした）。
 * 引き出しを開いたときだけ描く＝任された人にだけ出る項目の判定（probe）も、開いたときだけ行う（今までどおり）。
 */
function DrawerNav({
  resolved,
  pathname,
  onNavigate,
}: {
  resolved: ResolvedCategory[];
  pathname: string;
  onNavigate: () => void;
}) {
  const gatedAccess = useGatedAccess();
  const { sections: mobileNavSections, bottom: gatedBottom } = filterNavForViewer(resolved, gatedAccess);
  // 166: カテゴリの開閉（デスクトップのサイドバーと同じ設定・記憶を共有）
  const { isOpen, toggle } = useSidebarAccordion(mobileNavSections, pathname);
  return (
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
              <li key={item.key}>
                {item.gated ? (
                  <GatedNavLink item={item} badge={gatedAccess[item.key]?.badge} variant="drawer" onNavigate={onNavigate} />
                ) : item.external ? (
                  // 外部リンクは別タブで開く（指示書59）
                  // 171: ↗ で外部サイトだと分かるようにする（タップ領域は44px維持）
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                    title={`${item.label}（外部サイト・新しいタブで開きます）`}
                    className="rounded-md px-2 py-2 text-sm min-h-[44px] flex items-center gap-1 transition-colors text-foreground hover:bg-accent"
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    <PreviewMark on={item.preview} />
                    <span aria-hidden="true" className="shrink-0 text-[11px] text-muted-foreground">↗</span>
                    <span className="sr-only">（外部サイト・新しいタブで開きます）</span>
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`block rounded-md px-2 py-2 text-sm min-h-[44px] flex items-center transition-colors ${
                      pathname === item.href
                        ? "bg-teal-light text-teal font-medium"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {item.label}
                    <PreviewMark on={item.preview} />
                    <PresurveyNavMark href={item.href} />
                    <NoticesNavMark href={item.href} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          )}
        </div>
      ))}

      {/* 262: 任された人にだけ出る項目のうち、グループに置かれていないもの（今までどおりいちばん下） */}
      {gatedBottom.map((g) => (
        <GatedNavLink key={g.key} item={g} badge={gatedAccess[g.key]?.badge} variant="drawer" onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
