// 管理画面レイアウト（指示書39: サーバー側で管理者検証）
// - 未ログイン → ログイン誘導
// - 非管理者 → 「権限がありません」（ただし管理者0人なら自己管理者化のブートストラップ導線）
// - 管理者 → AdminShell（従来のヘッダー＋サイドナビ）
// クライアント判定に頼らず、cookieセッションの getUser() ＋ user_metadata.role で判定する。

import Link from "next/link";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser, countAdmins } from "@/lib/admin-role";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { AdminShell } from "@/components/admin/AdminShell";
import { BootstrapAdminCard } from "@/components/admin/BootstrapAdminCard";

// セッション（cookie）依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

function GateScreen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        {children}
        <p className="pt-1">
          <Link
            href="/"
            className="text-sm text-teal-700 underline underline-offset-2"
          >
            ← スタッフポータルへ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getSessionUser();

  if (!user) {
    return (
      <GateScreen title="🔒 管理画面">
        <p className="text-sm text-slate-600">
          管理画面を開くには、スタッフアカウントでのログインが必要です。
        </p>
        <p>
          <Link
            href="/login?next=/admin"
            className="inline-block px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            ログインページへ
          </Link>
        </p>
      </GateScreen>
    );
  }

  if (isAdminUser(user)) {
    return <AdminShell>{children}</AdminShell>;
  }

  // 非管理者: 管理者が0人なら初回セットアップの自己管理者化を案内
  let adminCount = -1;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    if (!error) adminCount = countAdmins(data.users);
  } catch {
    adminCount = -1; // service-role未設定などは判定不能 → 権限なし表示
  }

  if (adminCount === 0) {
    return (
      <GateScreen title="👑 初回セットアップ">
        <p className="text-sm text-slate-600">
          まだ管理者が設定されていません。最初にログインしたあなたを管理者に設定すると、管理画面が使えるようになります（この操作は管理者が0人のときだけ実行できます）。
        </p>
        <BootstrapAdminCard />
      </GateScreen>
    );
  }

  return (
    <GateScreen title="⛔ 権限がありません">
      <p className="text-sm text-slate-600">
        管理画面は管理者のみ利用できます。必要な場合は管理者（院長）に権限の付与を依頼してください。
      </p>
    </GateScreen>
  );
}
