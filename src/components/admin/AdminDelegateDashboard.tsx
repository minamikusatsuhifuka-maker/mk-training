// 255: 任された幹部の管理ダッシュボード（サーバーで描く）
//
// 任された機能のカードだけを出す。任されていない機能（四象限マトリクス・AI設定など）のカード・件数は描かない。
// どの機能を出すかはサーバー（app/admin/page.tsx）が menu_access から決めて渡す。開く先のページの判定は今までどおり。

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type DelegateCard = { key: string; label: string; href: string; description: string; count?: string };

export function AdminDelegateDashboard({ cards }: { cards: DelegateCard[] }) {
  return (
    <div className="max-w-4xl space-y-6" data-admin-dashboard="delegate">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">管理ダッシュボード</h1>
        <p className="text-sm text-slate-600 mt-1">院長から任されている機能です</p>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-slate-600" data-admin-dashboard-empty>
          いま任されている機能はありません。
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => (
            <Link key={c.key} href={c.href} data-admin-card={c.key}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer hover:border-teal-400 border-l-4 border-l-teal-500">
                <CardHeader>
                  <CardTitle className="text-base">
                    {c.label}
                    {c.count && <span className="ml-2 text-xs font-normal text-slate-500">{c.count}</span>}
                  </CardTitle>
                  <CardDescription className="text-xs">{c.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
