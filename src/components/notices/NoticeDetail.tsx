"use client";

// 📣 お知らせ・イベントの1件（指示書228 §2・§3）
//   本文・画像（本文の中にそのまま・押すと大きく）・PDF（その場で開く）・Word（ダウンロード）
//   イベント：自分の出欠（出席／欠席＋ひとこと100字まで）／出欠の一覧（つくった人・院長・指定した幹部だけ）／参加の確定
// 何を出すかはサーバーの応答どおり（rsvpList が null の人には一覧の枠ごと出さない）。

import { useCallback, useEffect, useState } from "react";
import {
  fetchNoticeDetail,
  invalidateNoticeSummary,
  markNoticeRead,
  sendRsvp,
  type NoticeDetailResponse,
  type RsvpRow,
} from "@/lib/notices-client";
import {
  NOTICE_KIND_LABEL,
  RSVP_COMMENT_MAX,
  RSVP_LABEL,
  formatBytes,
  formatHeld,
  type NoticeAttachment,
  type RsvpStatus,
} from "@/lib/notices";
import { AttendanceEditor } from "./AttendanceEditor";
import { DeadlineMark } from "./NoticesAlerts";

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_TONE: Record<RsvpStatus | "none", string> = {
  yes: "bg-teal-50 text-teal-800 border-teal-200",
  no: "bg-gray-100 text-gray-700 border-gray-200",
  none: "bg-amber-50 text-amber-800 border-amber-200",
};

export function RsvpBadge({ status }: { status: RsvpStatus | "none" }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${STATUS_TONE[status]}`}>{RSVP_LABEL[status]}</span>;
}

export function NoticeDetail({
  id,
  warnings,
  onBack,
  onEdit,
  onDelete,
  onChanged,
}: {
  id: string;
  warnings: string[];
  onBack: () => void;
  onEdit: (d: NoticeDetailResponse) => void;
  onDelete: (d: NoticeDetailResponse) => void;
  /** 開いた・答えた（一覧の印を取り直す） */
  onChanged: () => void;
}) {
  const [d, setD] = useState<NoticeDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<NoticeAttachment | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await fetchNoticeDetail(id));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, [id]);

  useEffect(() => {
    void load();
    // 開いた印（本人の分だけ）
    markNoticeRead(id)
      .then(() => {
        void invalidateNoticeSummary();
        onChanged();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="text-sm text-teal-700 underline">← 一覧へ</button>
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!d) return <p className="text-sm text-gray-500">読み込み中…</p>;
  const n = d.notice;
  const images = n.attachments.filter((a) => a.kind === "image");
  const docs = n.attachments.filter((a) => a.kind !== "image");

  return (
    <article className="space-y-4" data-notice-detail={n.id}>
      <button type="button" onClick={onBack} className="text-sm text-teal-700 underline min-h-[36px]">← 一覧へ</button>

      {warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5" role="alert">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {d.fileBucketMissing && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          貼ったファイルの置き場（event-photos）が見つかりません。院長に伝えてください（指示書165のSQLで作ります）。
        </p>
      )}

      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${n.kind === "event" ? "bg-orange-100 text-orange-800" : "bg-teal-100 text-teal-800"}`}>
            {NOTICE_KIND_LABEL[n.kind]}
          </span>
          {n.testSeed && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-800">🧪 検証用</span>}
        </div>
        <h2 className="text-lg font-bold text-gray-900 break-words">{n.title}</h2>
        <p className="text-xs text-gray-500">
          {n.authorName || "（名前なし）"} ・ {formatDateTime(n.createdAt)}
          {n.updatedAt !== n.createdAt && <>（{formatDateTime(n.updatedAt)} に更新）</>}
        </p>
        {n.kind === "event" && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-orange-50 px-3 py-2 text-sm">
            <dt className="text-gray-500">日時</dt>
            <dd className="text-gray-900">{formatHeld(n)}</dd>
            {n.place && (
              <>
                <dt className="text-gray-500">場所</dt>
                <dd className="text-gray-900 break-words">{n.place}</dd>
              </>
            )}
            <dt className="text-gray-500">出欠の締切</dt>
            <dd className="text-gray-900">
              <DeadlineMark deadline={n.rsvpDeadline} today={d.today} colored={d.inAudience && !d.myRsvp} />
            </dd>
          </dl>
        )}
      </header>

      {n.body && <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{n.body}</div>}

      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`} data-notice-images>
          {images.map((a) =>
            a.url ? (
              <button key={a.path} type="button" onClick={() => setZoom(a)} className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50" title="押すと大きく見られます">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className={`w-full ${images.length === 1 ? "max-h-[480px] object-contain" : "h-36 object-cover"}`} loading="lazy" />
              </button>
            ) : (
              <div key={a.path} className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-gray-400">画像を表示できません</div>
            )
          )}
        </div>
      )}

      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((a) => (
            <li key={a.path}>
              <a
                href={a.url || undefined}
                target={a.kind === "pdf" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={`flex min-h-[44px] items-center justify-between gap-2 rounded-lg border px-3 text-sm ${a.url ? "border-gray-200 bg-white text-gray-800 hover:bg-gray-50" : "pointer-events-none border-dashed text-gray-400"}`}
                data-notice-doc={a.kind}
              >
                <span className="min-w-0 truncate">{a.kind === "pdf" ? "📄" : "📝"} {a.name}<span className="ml-1 text-xs text-gray-400">{formatBytes(a.size)}</span></span>
                <span className="shrink-0 text-xs text-teal-700">{a.kind === "pdf" ? "開く ↗" : "ダウンロード ⬇"}</span>
              </a>
            </li>
          ))}
          <li className="text-[11px] text-gray-400">リンクは開いてから10分だけ使えます（切れたら画面を読み込み直してください）。</li>
        </ul>
      )}

      {d.canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onEdit(d)} className="min-h-[40px] rounded-lg border border-gray-300 px-4 text-sm text-gray-700" data-notice-edit>
            ✏️ 直す
          </button>
          <button type="button" onClick={() => onDelete(d)} className="min-h-[40px] rounded-lg border border-red-200 px-4 text-sm text-red-700" data-notice-delete>
            🗑 消す
          </button>
        </div>
      )}

      {n.kind === "event" && <MyRsvp d={d} onSaved={() => { void load(); void invalidateNoticeSummary(); onChanged(); }} />}
      {n.kind === "event" && d.rsvpList && <RsvpList d={d} rows={d.rsvpList} onSaved={load} />}
      {n.kind === "event" && d.attendance && <AttendanceBox d={d} onSaved={load} />}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"
          role="dialog"
          aria-label={zoom.name}
          onClick={() => setZoom(null)}
          data-notice-zoom
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={zoom.name} className="max-h-full max-w-full object-contain" />
          <button type="button" className="absolute right-3 top-3 min-h-[44px] min-w-[44px] rounded-full bg-white/90 text-lg" aria-label="閉じる">
            ×
          </button>
        </div>
      )}
    </article>
  );
}

// ─── 自分の出欠 ───

function MyRsvp({ d, onSaved }: { d: NoticeDetailResponse; onSaved: () => void }) {
  const [status, setStatus] = useState<RsvpStatus | null>(d.myRsvp?.status ?? null);
  const [comment, setComment] = useState(d.myRsvp?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  if (!d.inAudience) {
    return (
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        {d.notice.testSeed ? "検証用のイベントです（出欠をとるのは検証用アカウントだけ）。" : "このイベントの出欠の相手ではありません（検証用アカウント）。"}
      </section>
    );
  }
  // 締切のあと：本人は変えられない（つくった人・院長は自分の分も直せる）
  const canChange = d.rsvpOpen || d.canProxy;

  const save = async () => {
    if (!status) return setErr("「出席」か「欠席」を選んでください");
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await sendRsvp(d.notice.id, status, comment);
      setMsg("送りました");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送れませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-orange-200 bg-white p-3 space-y-2.5" data-my-rsvp>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">🙋 あなたの出欠</p>
        <span className="text-xs text-gray-600">
          いま：<RsvpBadge status={d.myRsvp?.status ?? "none"} />
          {d.myRsvp?.byProxy && <span className="ml-1 text-[11px] text-gray-500">（つくった人・院長が代わりに記入）</span>}
        </span>
      </div>
      {canChange ? (
        <>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`min-h-[44px] flex-1 rounded-lg border text-sm font-medium ${
                  status === s
                    ? s === "yes"
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-gray-600 bg-gray-600 text-white"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
                data-rsvp-choice={s}
              >
                {RSVP_LABEL[s]}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="rsvp-comment" className="mb-1 block text-xs text-gray-600">
              ひとこと（任意・{RSVP_COMMENT_MAX}字まで）
            </label>
            <input
              id="rsvp-comment"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[40px]"
              maxLength={RSVP_COMMENT_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className="min-h-[44px] rounded-lg bg-orange-600 px-5 text-sm font-medium text-white disabled:opacity-50" data-rsvp-send>
              {busy ? "送信中…" : d.myRsvp ? "変えて送る" : "送る"}
            </button>
            {msg && <span className="text-xs text-teal-700">{msg}</span>}
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
          <p className="text-[11px] text-gray-500">
            締切（<DeadlineMark deadline={d.notice.rsvpDeadline} today={d.today} colored={!d.myRsvp} />）までは変えられます。あなたの回答は、つくった人・院長・指定された幹部だけが見られます。
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-600">出欠の締切を過ぎました。直したいときは、つくった人か院長に伝えてください。</p>
      )}
    </section>
  );
}

// ─── 出欠の一覧（つくった人・院長・指定した幹部）───

function RsvpList({ d, rows, onSaved }: { d: NoticeDetailResponse; rows: RsvpRow[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const count = (s: RsvpStatus | "none") => rows.filter((r) => r.status === s).length;

  const proxy = async (userId: string, status: RsvpStatus) => {
    setErr("");
    try {
      const cur = rows.find((r) => r.userId === userId);
      await sendRsvp(d.notice.id, status, cur?.comment ?? "", userId);
      setEditing(null);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "直せませんでした");
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-rsvp-list>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">📋 出欠の一覧</p>
        <p className="text-xs text-gray-600">
          出席 {count("yes")}・欠席 {count("no")}・未回答 {count("none")}
        </p>
      </div>
      <p className="text-[11px] text-gray-500">この一覧が見えるのは、つくった人・院長・指定した幹部だけです。</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center gap-2 py-1.5 text-sm" data-rsvp-row={r.status}>
            <span className="min-w-[7em] font-medium text-gray-900">{r.name}</span>
            <RsvpBadge status={r.status} />
            {r.byProxy && <span className="text-[10px] text-gray-500">代理</span>}
            {r.comment && <span className="min-w-0 flex-1 break-words text-xs text-gray-600">「{r.comment}」</span>}
            {d.canProxy &&
              (editing === r.userId ? (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => proxy(r.userId, "yes")} className="min-h-[32px] rounded border border-teal-600 px-2 text-xs text-teal-700">出席に</button>
                  <button type="button" onClick={() => proxy(r.userId, "no")} className="min-h-[32px] rounded border border-gray-500 px-2 text-xs text-gray-700">欠席に</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[32px] px-1 text-xs text-gray-500">やめる</button>
                </span>
              ) : (
                <button type="button" onClick={() => setEditing(r.userId)} className="ml-auto min-h-[32px] text-xs text-teal-700 underline">
                  代わりに直す
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── 参加の確定 ───

function AttendanceBox({ d, onSaved }: { d: NoticeDetailResponse; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const a = d.attendance!;
  if (!a.canEdit) {
    if (!a.confirmed) return null;
    return (
      <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        ✅ 参加を確定しました（{formatDateTime(a.confirmedAt)}）。参加の記録は院長と指定した幹部が管理画面で見ます。
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2" data-attendance-box>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">✅ 参加の確定</p>
        {a.confirmed && <span className="text-xs text-gray-600">確定済み（{formatDateTime(a.confirmedAt)}）</span>}
      </div>
      {open ? (
        <AttendanceEditor noticeId={d.notice.id} onSaved={onSaved} onClose={() => setOpen(false)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="min-h-[44px] rounded-lg bg-teal-700 px-4 text-sm font-medium text-white" data-attendance-open>
          {a.confirmed ? "参加した人を直す" : "参加を確定する"}
        </button>
      )}
    </section>
  );
}
