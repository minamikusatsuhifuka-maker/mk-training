"use client";

// サイドメニューの「⚙ 管理画面」リンク（指示書39 → 183）
// 管理者に加えて、管理画面の項目を委任された幹部にも出す。判定はサーバー（/api/admin/my-items＝自分の情報だけ）。
// 表示制御のみ。実際のアクセス制御は proxy.ts・admin/layout.tsx・各APIのサーバー判定で行う。
// 何も委任されていない人には出さない（fail-close）。

import { useEffect, useState } from "react";

export function AdminAreaLink({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/my-items", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as { isAdmin?: boolean; items?: string[] };
        if (!cancelled) setVisible(j.isAdmin === true || (Array.isArray(j.items) && j.items.length > 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!visible) return null;
  return <>{children}</>;
}
