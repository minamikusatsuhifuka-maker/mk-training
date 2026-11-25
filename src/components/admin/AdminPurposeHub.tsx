// 第8便: 管理画面の入口「やりたいことから選ぶ」（目的別ハブ）
//
// どこを開けばいいか迷わないための入口カード。合わせて、その画面で扱う内容が
// スタッフにどこまで見えるかを**色とタグ**で示す（③の要望）:
//   🟢 emerald  = ここで作った内容はスタッフ画面に出る
//   🟡 amber    = 本人と共有する内容（公開範囲の決まりどおり）
//   ⚪ slate    = スタッフには見えない（管理者・指名された人だけ）
// 見た目だけの部品（権限の判定はしない）。出すカード・リンクは呼び出し側が決める。

import Link from "next/link";

export type PurposeShare = "staff" | "personal" | "admin";
export type PurposeCard = {
  icon: string;
  title: string;
  desc: string;
  share: PurposeShare;
  links: { label: string; href: string }[];
};

const SHARE_STYLE: Record<PurposeShare, { border: string; tag: string; tagCls: string }> = {
  staff: {
    border: "border-l-emerald-500",
    tag: "👁 スタッフ画面に出ます",
    tagCls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  personal: {
    border: "border-l-amber-500",
    tag: "🤝 本人と共有（公開範囲の決まりどおり）",
    tagCls: "bg-amber-50 text-amber-800 border-amber-200",
  },
  admin: {
    border: "border-l-slate-400",
    tag: "🔒 スタッフには見えません",
    tagCls: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export function AdminPurposeHub({ cards }: { cards: PurposeCard[] }) {
  const visible = cards.filter((c) => c.links.length > 0);
  if (visible.length === 0) return null;
  return (
    <section className="space-y-2" data-admin-purpose-hub>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-slate-800">📍 やりたいことから選ぶ</h2>
        <p className="text-[11px] text-slate-500">
          左端の色＝スタッフにどこまで見えるか（🟢 スタッフに見える／🟡 本人と共有／⚪ 管理者だけ）
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((c) => {
          const s = SHARE_STYLE[c.share];
          return (
            <div
              key={c.title}
              className={`rounded-xl border border-slate-200 bg-white border-l-4 ${s.border} p-3 space-y-2`}
              data-purpose-card
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">
                  {c.icon} {c.title}
                </p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${s.tagCls}`}>{s.tag}</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{c.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-full border border-teal-300 bg-teal-50/50 px-3 py-1.5 text-xs text-teal-800 hover:bg-teal-100 min-h-[36px] inline-flex items-center"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 院長（管理者）用の入口カード一式（全部開ける前提） */
export const ADMIN_PURPOSE_CARDS: PurposeCard[] = [
  {
    icon: "👥",
    title: "スタッフを管理する",
    desc: "名簿・氏名の統一・在籍区分、住所や緊急連絡先の登録、アカウント招待と権限。新しいスタッフを迎える順番①〜⑤はスタッフ管理の先頭に出ます。",
    share: "admin",
    links: [
      { label: "👥 スタッフ管理", href: "/admin/staff-members" },
      { label: "📇 スタッフ連絡先", href: "/staff-contacts" },
      { label: "👤 アカウント招待", href: "/admin/staff-accounts" },
    ],
  },
  {
    icon: "🌱",
    title: "育てる・1on1・サーベイ",
    desc: "流れ: 🗓 日程で1on1を登録 → 本人の画面に予定と事前アンケートが出る → 回答は「事前アンケートの回答」で確認 → 面談の記録は個人シートへ。",
    share: "personal",
    links: [
      { label: "📄 スタッフ個人シート", href: "/staff-growth" },
      { label: "🗓 1on1の日程", href: "/admin/one-on-one-slots" },
      { label: "📝 事前アンケートの回答", href: "/admin/presurvey-answers" },
    ],
  },
  {
    icon: "📣",
    title: "スタッフに見せるものを作る",
    desc: "ポータルトップのお知らせ・今日の一言、イベントの出欠、左メニューの並び。ここで保存した内容はスタッフ画面にそのまま出ます。",
    share: "staff",
    links: [
      { label: "🏠 ポータル管理", href: "/admin/portal" },
      { label: "📣 イベントの出欠", href: "/admin/notice-attendance" },
      { label: "🧭 サイドバー構成", href: "/admin/nav" },
    ],
  },
  {
    icon: "📚",
    title: "学びの中身を整える",
    desc: "疾患・薬剤・クイズ・美容などの研修コンテンツ。スタッフの学習画面に出ます。",
    share: "staff",
    links: [
      { label: "📚 疾患・薬剤・クイズ", href: "/admin/diseases" },
      { label: "✨ 美容・カウンセリング", href: "/admin/counseling" },
    ],
  },
];
