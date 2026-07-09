"use client";

// ログイン状態メニュー（サイドバー下部・モバイルドロワー用）
// 未ログイン: 「ログイン」リンク ／ ログイン中: 表示名＋マイプロフィール＋ログアウト

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function displayNameOf(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null;
  const name = typeof meta?.display_name === "string" ? meta.display_name : "";
  return name || user.email || "";
}

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoaded(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push("/");
    router.refresh();
  };

  if (!loaded) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span>🔑</span>
        <span>ログイン</span>
      </Link>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="px-2 py-1 text-xs text-foreground/80 truncate">
        👤 {displayNameOf(user)}
      </p>
      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span>✏️</span>
        <span>マイプロフィール</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span>🚪</span>
        <span>ログアウト</span>
      </button>
    </div>
  );
}
