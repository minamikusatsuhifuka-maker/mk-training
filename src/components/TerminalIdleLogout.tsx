"use client";
// 院内端末の自動ログアウト（指示書192 D）
//   この端末が院内端末（鍵あり）でスイッチがON（192-補）のときだけ動く。操作がないまま設定の分数（既定15分）で自動ログアウト。
//   1分前に予告を出す。ログアウト時（手動・自動とも）はそのタブの下書き（sessionStorage・176-補）を消す。
//   院内端末でなければ何もしない（これまでどおり）。

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { reloadTo } from "@/lib/auth-navigation";
import { TERMINAL_FLAG_KEY, clearDraftsIfTerminal, markTerminalSession } from "@/lib/terminal-client";

const PUBLIC_PATHS = ["/login", "/reset-password", "/join"];
const WARN_BEFORE_MS = 60_000;

export function TerminalIdleLogout({ ignorePublic = false }: { ignorePublic?: boolean } = {}) {
  const pathname = usePathname();
  const [state, setState] = useState<{ terminal: boolean; idleMs: number } | null>(null);
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef<number>(Date.now());
  const loggingOut = useRef(false);

  const isPublic = !ignorePublic && PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (isPublic) return;
    let alive = true;
    fetch("/api/auth/terminal", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { terminal?: boolean; idleMinutes?: number } | null) => {
        if (!alive) return;
        const terminal = !!j?.terminal;
        markTerminalSession(terminal);
        setState({ terminal, idleMs: Math.max(0.5, Number(j?.idleMinutes ?? 15)) * 60_000 });
      })
      .catch(() => {
        if (alive) setState({ terminal: false, idleMs: 0 });
      });
    return () => {
      alive = false;
    };
  }, [isPublic]);

  useEffect(() => {
    if (!state?.terminal) return;
    const bump = () => {
      lastActivity.current = Date.now();
      setWarning(false);
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= state.idleMs) {
        if (loggingOut.current) return;
        loggingOut.current = true;
        void (async () => {
          try {
            clearDraftsIfTerminal(true);
            await getSupabaseBrowserClient().auth.signOut();
          } finally {
            reloadTo("/login");
          }
        })();
      } else if (idle >= state.idleMs - WARN_BEFORE_MS) {
        setWarning(true);
      }
    }, 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      window.clearInterval(timer);
    };
  }, [state]);

  if (!state?.terminal || !warning) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pointer-events-none" data-terminal-idle-warning>
      <div className="mx-auto max-w-md rounded-xl bg-amber-50 border border-amber-300 shadow-lg px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto">
        <p className="text-sm text-amber-900">操作がないため、あと1分で自動ログアウトします（書きかけの内容も消えます）。</p>
        <button type="button" onClick={() => { lastActivity.current = Date.now(); setWarning(false); }} className="shrink-0 px-3 py-1.5 rounded-full bg-amber-600 text-white text-sm min-h-[36px]">
          続ける
        </button>
      </div>
      <span className="hidden" data-terminal-flag={TERMINAL_FLAG_KEY} />
    </div>
  );
}
