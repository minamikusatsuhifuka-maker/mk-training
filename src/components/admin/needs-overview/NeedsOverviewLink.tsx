"use client";

// 276 §4: 1on1ノート・可能性ノートの1on1タブに出す「🧭 欲求を見る」（院長が見ているときだけ）。
// 院長かどうかはサーバーに1回だけ聞く（/api/admin/needs-overview?probe=1・院長以外は 404＝出さない）。
// 押すと「🧭 欲求の一覧」の一人ずつの詳しい画面を開く。

import { useEffect, useState } from "react";
import Link from "next/link";

let probe: Promise<boolean> | null = null;
function isDirectorViewer(): Promise<boolean> {
  if (!probe) {
    probe = fetch("/api/admin/needs-overview?probe=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return probe;
}

export function NeedsOverviewLink({ userId }: { userId: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    void isDirectorViewer().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  if (!ok || !userId) return null;
  return (
    <Link
      href={`/admin/needs-overview?user=${encodeURIComponent(userId)}`}
      className="inline-flex min-h-[32px] items-center rounded-full border border-indigo-300 bg-indigo-50 px-2.5 text-[11px] text-indigo-900"
      data-needs-overview-link={userId}
    >
      🧭 欲求を見る
    </Link>
  );
}
