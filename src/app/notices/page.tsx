"use client";

// 📣 お知らせ・イベント（指示書228・機能ID notices）
// - 一覧は新しい順。まだ開いていないものに印。イベントには開催日と自分の出欠（未回答／出席／欠席）
// - つくれるのはスタッフ全員。直す・消すは、つくった人と院長
// - ?id=<お知らせid> でその1件を開く（メールのリンクもこの形）
// - 見られる人の判定はすべてサーバー（/api/notices・lib/notices-server.ts）
// - スイッチOFFの間は FeatureGate が「準備中」（院長と検証用アカウントはプレビューで開ける）

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { NoticeForm } from "@/components/notices/NoticeForm";
import { NoticeDetail, RsvpBadge } from "@/components/notices/NoticeDetail";
import {
  deleteNotice,
  fetchNoticeList,
  invalidateNoticeSummary,
  type NoticeDetailResponse,
  type NoticesListResponse,
} from "@/lib/notices-client";
import { NOTICE_KIND_LABEL, formatHeld, type Notice, type NoticeListItem } from "@/lib/notices";
import { DeadlineMark, RsvpAlertBanners } from "@/components/notices/NoticesAlerts";

type Filter = "all" | "event" | "notice" | "unread";

function formatCreated(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
}

function NoticeCard({ n, onOpen, today }: { n: NoticeListItem; onOpen: () => void; today: string }) {
  const unread = !n.read && !n.isMine;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${unread ? "border-teal-300 bg-teal-50/50" : "border-gray-200 bg-white"}`}
        data-notice-card={n.id}
        data-unread={unread ? "1" : undefined}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {unread && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">未読</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${n.kind === "event" ? "bg-orange-100 text-orange-800" : "bg-teal-100 text-teal-800"}`}>
            {NOTICE_KIND_LABEL[n.kind]}
          </span>
          {n.testSeed && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-800">🧪 検証用</span>}
          <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-bold" : "font-medium"} text-gray-900`}>{n.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {n.kind === "event" && (
            <>
              <span className="text-gray-700">🗓 {formatHeld(n)}</span>
              {n.inAudience && (
                <span className="flex items-center gap-1">
                  あなた：<RsvpBadge status={n.myRsvp ?? "none"} />
                  <span className="text-gray-500">締切</span>
                  <DeadlineMark deadline={n.rsvpDeadline} today={today} colored={!n.myRsvp} />
                </span>
              )}
            </>
          )}
          {n.attachmentCount > 0 && <span>📎 {n.attachmentCount}{n.imageCount > 0 ? `（画像${n.imageCount}）` : ""}</span>}
          <span>
            {n.authorName || "（名前なし）"}・{formatCreated(n.createdAt)}
          </span>
        </div>
      </button>
    </li>
  );
}

function NoticesBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("id");
  const [list, setList] = useState<NoticesListResponse | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Notice | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setList(await fetchNoticeList());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchNoticeList()
      .then((r) => alive && setList(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const go = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname, { scroll: true });
    },
    [pathname, router]
  );

  const shown = useMemo(() => {
    const items = list?.notices ?? [];
    if (filter === "event") return items.filter((n) => n.kind === "event");
    if (filter === "notice") return items.filter((n) => n.kind === "notice");
    if (filter === "unread") return items.filter((n) => !n.read && !n.isMine);
    return items;
  }, [list, filter]);

  const remove = async (d: NoticeDetailResponse) => {
    const msg =
      d.notice.kind === "event"
        ? `「${d.notice.title}」を消します。貼ったファイルと出欠も消えます（確定した参加の記録は残ります）。元に戻せません。よろしいですか？`
        : `「${d.notice.title}」を消します。貼ったファイルも消えます。元に戻せません。よろしいですか？`;
    if (!window.confirm(msg)) return;
    try {
      await deleteNotice(d.notice.id);
      go(null);
      await load();
      void invalidateNoticeSummary();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "消せませんでした");
    }
  };

  if (mode === "create" || (mode === "edit" && editing)) {
    return (
      <NoticeForm
        initial={mode === "edit" ? editing ?? undefined : undefined}
        onCancel={() => {
          setMode("list");
          setEditing(null);
        }}
        onDone={(id, w) => {
          setMode("list");
          setEditing(null);
          setWarnings(w);
          void load();
          go(id);
        }}
      />
    );
  }

  if (openId) {
    return (
      <NoticeDetail
        key={openId}
        id={openId}
        warnings={warnings}
        onBack={() => {
          setWarnings([]);
          go(null);
        }}
        onEdit={(d) => {
          setEditing(d.notice);
          setMode("edit");
        }}
        onDelete={remove}
        onChanged={() => void load()}
      />
    );
  }

  const s = list?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMode("create")}
          className="min-h-[44px] rounded-lg bg-teal-700 px-4 text-sm font-medium text-white"
          data-notice-create
        >
          ＋ お知らせ・イベントをつくる
        </button>
        {s && (s.unread > 0 || s.unanswered > 0) && (
          <p className="text-xs text-gray-600">
            {s.unread > 0 && <>未読 <b className="text-red-600">{s.unread}</b>件</>}
            {s.unread > 0 && s.unanswered > 0 && "・"}
            {s.unanswered > 0 && <>出欠が未回答 <b className="text-amber-700">{s.unanswered}</b>件</>}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {(
          [
            ["all", "すべて"],
            ["unread", "未読"],
            ["event", "イベント"],
            ["notice", "お知らせ"],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`min-h-[36px] rounded-full border px-3 text-xs ${filter === k ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!list && !error && <p className="text-sm text-gray-500">読み込み中…</p>}
      {list && shown.length === 0 && <p className="text-sm text-gray-500">まだありません。</p>}
      <ul className="space-y-2">
        {shown.map((n) => (
          <NoticeCard key={n.id} n={n} onOpen={() => go(n.id)} today={list?.today ?? ""} />
        ))}
      </ul>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader
        navKey="/notices"
        title="📣 お知らせ・イベント"
        description="画像やファイルを貼れるお知らせと、出欠をとるイベント"
      />
      <FeatureGate feature="notices">
        {/* 230 §2: 締切3日前からの未回答の帯（一覧・1件のどちらを開いていても上に出す） */}
        <RsvpAlertBanners />
        <Suspense fallback={<p className="text-sm text-gray-500">読み込み中…</p>}>
          <NoticesBoard />
        </Suspense>
      </FeatureGate>
    </div>
  );
}
