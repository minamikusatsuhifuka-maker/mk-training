"use client";

// サイドメニューのアコーディオン表示設定（指示書166 B）
//
// 【設定（管理者・全員共通）】
// - content_store の portal_sidebar_mode に { mode, updatedAt } を保存（character_order 流儀）。
// - mode = "open"（すべて開く・既定）| "closed"（カテゴリ見出しのみ表示）。
// - 未保存・取得失敗・不正値は "open" ＝現状どおり全項目表示（歯止め5：既定は現状維持）。
//
// 【スタッフ側の開閉挙動】
// - 見出しタップで開閉できる（設定に関わらず）。
// - 現在ページが属するカテゴリは "closed" 設定でも開く（自分の居場所が分かるように）。
//   ページ移動で新しいカテゴリに入ったときは、そのカテゴリの「閉じた」記憶を破棄して開く。
// - ユーザーが開閉した状態は sessionStorage でそのセッション中だけ保持する。
//   管理者が設定を変更（updatedAt が変わる）したら記憶を破棄し、設定を優先する。

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPortalObject, savePortalObject } from "@/lib/portal-store";
import type { ResolvedCategory } from "@/lib/nav";

export const SIDEBAR_MODE_KEY = "portal_sidebar_mode";

export type SidebarMode = "open" | "closed";

export type SidebarModeStore = {
  mode: SidebarMode;
  updatedAt: string;
};

export const DEFAULT_SIDEBAR_MODE_STORE: SidebarModeStore = {
  mode: "open",
  updatedAt: "",
};

// 保存値の検証（不正値は既定 "open" に倒す）
export function normalizeSidebarModeStore(saved: unknown): SidebarModeStore {
  if (saved && typeof saved === "object") {
    const s = saved as Partial<SidebarModeStore>;
    if (s.mode === "open" || s.mode === "closed") {
      return {
        mode: s.mode,
        updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : "",
      };
    }
  }
  return DEFAULT_SIDEBAR_MODE_STORE;
}

export async function loadSidebarModeStore(): Promise<SidebarModeStore> {
  const saved = await loadPortalObject<unknown>(SIDEBAR_MODE_KEY, null);
  return normalizeSidebarModeStore(saved);
}

export async function saveSidebarMode(mode: SidebarMode): Promise<boolean> {
  return savePortalObject<SidebarModeStore>(SIDEBAR_MODE_KEY, {
    mode,
    updatedAt: new Date().toISOString(),
  });
}

// ─── セッション中の開閉記憶（sessionStorage） ───

const SESSION_KEY = "sidebar_accordion_v1";

type SessionState = {
  sig: string; // 管理者設定の署名（mode|updatedAt）。不一致なら記憶を破棄する
  open: Record<string, boolean>; // カテゴリid → 開閉のユーザー操作（未操作のidは含めない）
};

function sigOf(store: SidebarModeStore): string {
  return `${store.mode}|${store.updatedAt}`;
}

function readSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed || typeof parsed.sig !== "string" || typeof parsed.open !== "object" || !parsed.open) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(state: SessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* プライベートモード等で失敗しても開閉自体は動く */
  }
}

// ─── 描画側の共通フック（sidebar.tsx / AppShellInner.tsx の2箇所で使用） ───

export function useSidebarAccordion(
  sections: ResolvedCategory[],
  pathname: string
): { isOpen: (id: string) => boolean; toggle: (id: string) => void } {
  const [modeStore, setModeStore] = useState<SidebarModeStore>(
    DEFAULT_SIDEBAR_MODE_STORE
  );
  // ユーザー操作の開閉記憶。初期値は空（SSR/ハイドレーション時は既定表示と一致させ、
  // sessionStorage の復元は下の非同期ロード完了後に行う）
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // 現在ページが属するカテゴリ（外部リンクは対象外・完全一致は既存のハイライトと同じ流儀）
  const activeCategoryId = useMemo(() => {
    for (const section of sections) {
      if (section.items.some((it) => !it.external && it.href === pathname)) {
        return section.id;
      }
    }
    return null;
  }, [sections, pathname]);

  // 管理者設定を読み込む。署名が変わっていればセッション記憶を破棄（設定優先）、
  // 変わっていなければ復元する。現在ページのカテゴリの「閉じた」記憶は破棄して開く。
  useEffect(() => {
    let active = true;
    loadSidebarModeStore()
      .then((store) => {
        if (!active) return;
        setModeStore(store);
        const session = readSession();
        if (session && session.sig !== sigOf(store)) {
          setOverrides({});
          writeSession({ sig: sigOf(store), open: {} });
          return;
        }
        if (session) {
          const restored = { ...session.open };
          if (activeCategoryId && restored[activeCategoryId] === false) {
            delete restored[activeCategoryId];
          }
          setOverrides(restored);
        }
      })
      .catch(() => {
        /* 既定（すべて開く）のまま */
      });
    return () => {
      active = false;
    };
    // activeCategoryId は初回復元の補正にだけ使う（ページ移動時の補正は下の render 時調整で行う）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ページ移動で入ったカテゴリは「閉じた」記憶を破棄して開く。
  // あわせて sessionStorage を再読込し、デスクトップ／ドロワーの2インスタンス間の記憶を揃える。
  // effect ではなく「props 変化に応じた render 時の状態調整」パターン
  // （初回 render では動かないためハイドレーション不一致は起きない）。
  const [syncedPath, setSyncedPath] = useState(pathname);
  if (pathname !== syncedPath) {
    setSyncedPath(pathname);
    const session = readSession();
    setOverrides((prev) => {
      const next = { ...(session?.open ?? prev) };
      if (activeCategoryId && next[activeCategoryId] === false) {
        delete next[activeCategoryId];
      }
      return next;
    });
  }

  const isOpen = useCallback(
    (id: string): boolean => {
      const override = overrides[id];
      if (typeof override === "boolean") return override;
      if (modeStore.mode === "open") return true;
      return id === activeCategoryId;
    },
    [overrides, modeStore.mode, activeCategoryId]
  );

  const toggle = useCallback(
    (id: string) => {
      setOverrides((prev) => {
        const next = { ...prev, [id]: !isOpen(id) };
        writeSession({ sig: sigOf(modeStore), open: next });
        return next;
      });
    },
    [isOpen, modeStore]
  );

  return { isOpen, toggle };
}
