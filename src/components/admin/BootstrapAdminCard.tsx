"use client";

// 初回セットアップ用: 管理者が0人のとき、ログイン中の本人を管理者化するボタン（指示書39）
// 管理者が1人でもできたらAPI側で拒否され、この画面自体も表示されなくなる。

import { useState } from "react";

export function BootstrapAdminCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    if (
      !confirm(
        "自分を管理者にしますか？（初回セットアップ・管理者が0人のときだけ実行できます）"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/staff-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap-admin" }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setBusy(false);
      setError(j?.error ?? "管理者化に失敗しました");
      return;
    }
    // ロールはサーバー側で判定されるため、リロードして管理画面を開き直す
    window.location.reload();
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
      >
        {busy ? "設定中..." : "👑 自分を管理者にする（初回のみ）"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
