"use client";

// 管理画面の共通シェル（ヘッダー＋サイドナビ）。
// 認可は src/app/admin/layout.tsx（サーバー側）と proxy.ts で行う。
// 183: 項目一覧の正本は lib/admin-items.ts。委任された幹部には指名された項目だけを出す（allowedKeys）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontSwitcher } from "@/components/FontSwitcher";
import { ADMIN_ITEMS, PEOPLE_TRAINING_ITEM_KEY } from "@/lib/admin-items";
import { loadPortalObject } from "@/lib/portal-store";
import {
  ADMIN_MENU_GROUPS_KEY,
  ADMIN_MENU_UPDATED_EVENT,
  EXTRA_MENU_ITEMS,
  groupOfHref,
  normalizeAdminMenuConfig,
  resolveAdminMenu,
  type AdminMenuConfig,
  type MenuItemLike,
} from "@/lib/admin-menu-groups";

/** 241: グループの開け閉めをこのブラウザで覚える（読み書きできなくても画面は出る） */
const MENU_OPEN_LS_KEY = "mk_admin_menu_open";

function readOpen(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(MENU_OPEN_LS_KEY) || "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function writeOpen(v: Record<string, boolean>): void {
  try {
    localStorage.setItem(MENU_OPEN_LS_KEY, JSON.stringify(v));
  } catch {
    /* 覚えられなくても開け閉めはできる */
  }
}

// 項目一覧（表示順は lib/admin-items.ts の定義順。241 からはグループの並びで出す）
const adminNav = ADMIN_ITEMS.filter((i) => !i.hidden).map((i) => ({ key: i.key, label: i.label, href: i.href }));
const extra = (key: string): MenuItemLike => EXTRA_MENU_ITEMS.find((i) => i.key === key)!;

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
  // 人材育成研修も同じ流儀（院長と受講者だけ・ほかの管理者には出さない。probeが404ならリンクを出さない）
  const [canSeeTraining, setCanSeeTraining] = useState(false);
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
    probe("/api/admin/people-training", setCanSeeTraining);
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems: MenuItemLike[] = [
    ...adminNav.filter((i) => allowedKeys.includes(i.key) && (i.key !== PEOPLE_TRAINING_ITEM_KEY || canSeeTraining)),
    ...(canSeeNotes
      ? [extra("x:member-notes")]
      : []),
    ...(canSeeDocTasks
      ? [
          extra("x:doc-tasks"),
          // 157: 設定はここから開く（実体は /doc-tasks/settings。
          //   /admin 配下だと未ログイン・非管理者に200が返り、ルートの存在が漏れるため）
          // 211 D: **設定は院長のみ**（/doc-tasks/settings は管理者以外に404）。
          //   ボードが見える人みんなに出していたため、押すと404になっていた。
          ...(isAdmin
            ? [extra("x:doc-tasks-settings")]
            : []),
        ]
      : []),
    ...(canSeeContacts
      ? [
          extra("x:staff-contacts"),
          // 169: 設定はここから開く（実体は /staff-contacts/settings。
          //   /admin 配下だとルートの存在が漏れるため・157と同じ理由）
          // 211 D: 書類進捗の設定と**同じ作り**＝こちらも院長のみ（押すと404だった）
          ...(isAdmin
            ? [extra("x:staff-contacts-settings")]
            : []),
        ]
      : []),
    ...(canSeeRetro
      ? [extra("x:retro")]
      : []),
    ...(canSeeGrowth
      ? [
          extra("x:staff-growth"),
          // 179: 講座マスタ・設定はここから開く（/admin 配下だとルートの存在が漏れるため・157と同じ理由）。
          // 183: 講座マスタ（AI下書きの設定を含む）は院長のみ
          ...(isAdmin ? [extra("x:courses")] : []),
        ]
      : []),
    // 欲求別成長支援ガイド：院長・管理者と、人材育成研修の受講者（その項目を任された人）
    ...(allowedKeys.includes(PEOPLE_TRAINING_ITEM_KEY) ? [extra("x:needs-guide")] : []),
  ];

  // ─── 241: グループに分けて折りたたむ ───
  const [menuCfg, setMenuCfg] = useState<AdminMenuConfig>(() => normalizeAdminMenuConfig(null));
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadPortalObject<unknown>(ADMIN_MENU_GROUPS_KEY, null)
        .then((raw) => alive && setMenuCfg(normalizeAdminMenuConfig(raw)))
        .catch(() => {
          /* 読めなければ、はじめの振り分けのまま */
        });
    void load();
    window.addEventListener(ADMIN_MENU_UPDATED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(ADMIN_MENU_UPDATED_EVENT, load);
    };
  }, []);
  const menu = resolveAdminMenu(menuCfg, navItems);
  const activeGroup = groupOfHref(menu, pathname);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // 覚えている開け閉めは、画面を出したあとに読む（サーバーで作る画面と食い違わないように）
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) setOpenMap(readOpen());
    });
    return () => {
      alive = false;
    };
  }, []);
  // 今開いているページを含むグループは開いておく（覚えている状態より優先）
  const isOpen = (id: string) => id === activeGroup || openMap[id] === true;
  const toggle = (id: string, open: boolean) => {
    if (id === activeGroup && !open) return; // 今のページのグループは閉じない
    setOpenMap((prev) => {
      const next = { ...prev, [id]: open };
      writeOpen(next);
      return next;
    });
  };

  const renderGroups = (variant: "mobile" | "desktop") => {
    const linkCls = (active: boolean) =>
      variant === "mobile"
        ? `block rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-slate-500 text-white font-medium" : "text-slate-300 hover:bg-slate-600 hover:text-white"}`
        : `block rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-slate-600 text-white font-medium" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`;
    const link = (item: MenuItemLike) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={variant === "mobile" ? () => setMenuOpen(false) : undefined}
        className={linkCls(pathname === item.href)}
      >
        {item.label}
      </Link>
    );
    return (
      <>
        {menu.top && link(menu.top)}
        {menu.groups.map((g) => (
          <details
            key={g.id}
            open={isOpen(g.id)}
            data-admin-menu-group={g.id}
          >
            {/* 開け閉めは React の状態だけで決める（ブラウザ任せの開閉と食い違うと、続けて押したとき覚えそこねるため） */}
            <summary
              onClick={(e) => {
                e.preventDefault();
                toggle(g.id, !isOpen(g.id));
              }}
              className="cursor-pointer select-none rounded-md px-2 py-2 text-xs font-semibold text-slate-400 hover:text-white">
              {g.label}
            </summary>
            <div className="space-y-1 pl-1">{g.items.map(link)}</div>
          </details>
        ))}
      </>
    );
  };

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
          {renderGroups("mobile")}
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-[200px] shrink-0 bg-slate-800 min-h-[calc(100vh-52px)] px-3 py-4">
          <nav className="space-y-1">{renderGroups("desktop")}</nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-3 md:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
