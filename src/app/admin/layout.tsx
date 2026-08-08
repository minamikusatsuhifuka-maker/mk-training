// 管理画面レイアウト（指示書39: サーバー側で管理者検証／指示書158: 秘匿の統一）
// - 管理者 → AdminShell（従来のヘッダー＋サイドナビ）
// - それ以外（未ログイン・非管理者）→ **一律 404**
// - 例外は「管理者が0人」のときだけ（初回セットアップの復旧導線）
// クライアント判定に頼らず、cookieセッションの getUser() ＋ user_metadata.role で判定する。
//
// 【なぜ 404 に統一するのか（158-D）】
// 以前は未ログインに「ログインが必要です」、非管理者に「権限がありません」を **200** で返していた。
// すると `/admin/存在しないパス` は404、`/admin/実在ページ` は200となり、
// **配下の全ページでルートの存在が漏れる**（157で実測）。
// 要件は「404を返すこと」ではなく **「全パスで応答が同一であること」** なので、
// 未ログインと非管理者で画面を分けず、存在しないパスと同じ404に揃える。
// ログインが必要な場合の案内は、全パスで出る 404 ページ側の一般文言に置いた。

import Link from "next/link";
import { notFound } from "next/navigation";
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

  if (user && isAdminUser(user)) {
    return <AdminShell>{children}</AdminShell>;
  }

  // 未ログインは他と区別せず 404（存在しないパスと同じ応答にする）
  if (!user) notFound();

  // 例外: 管理者が0人のときだけ、ログイン済みの人に初回セットアップを見せる。
  // これが無いと管理者を1人も作れない状態から復旧できなくなる（アプリ外の手段しか残らない）。
  // 「管理者が0人」はサイト全体の状態であって、パスごとに応答が変わるわけではない。
  let adminCount = -1;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    if (!error) adminCount = countAdmins(data.users);
  } catch {
    adminCount = -1; // service-role未設定などは判定不能 → 404（開けない方向）
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

  // 管理者はいるが自分は管理者でない → 404（「権限がありません」とは言わない）
  notFound();
}
