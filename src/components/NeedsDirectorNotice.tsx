"use client";

// 277 §4: 欲求サーベイの見え方のお知らせ（院長がスイッチを ON にした回ごとに、確認するまで出す）
// ・アプリのどの画面でも1回（AppShellInner）・欲求サーベイの画面（プロフィール）では確認するまで画面の中に出す
// ・「確認しました」を押すと消える（誰が確認したかは院長だけが管理画面で見る）
// ・OFF の間は何も出さない。文は院長が管理画面で直したもの（/api/needs-survey/director-view が返す）

import { useCallback, useEffect, useState } from "react";
import { NEEDS_DIRECTOR_ACK_BUTTON, type NeedsDirectorTexts } from "@/lib/needs-director-view";

export type NeedsDirectorViewResp = { on: boolean; texts: NeedsDirectorTexts | null; showNotice: boolean };

const ACK_EVENT = "mk-needs-director-ack";
let cache: Promise<NeedsDirectorViewResp> | null = null;

function load(): Promise<NeedsDirectorViewResp> {
  if (!cache) {
    cache = fetch("/api/needs-survey/director-view", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<NeedsDirectorViewResp>) : { on: false, texts: null, showNotice: false }))
      .catch(() => ({ on: false, texts: null, showNotice: false }));
  }
  return cache;
}

/** スイッチの状態と文（読めなければ OFF＝今の文のまま） */
export function useNeedsDirectorView(): [NeedsDirectorViewResp | null, () => Promise<void>] {
  const [v, setV] = useState<NeedsDirectorViewResp | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((x) => alive && setV(x));
    const onAck = () => void load().then((x) => alive && setV(x));
    window.addEventListener(ACK_EVENT, onAck);
    return () => {
      alive = false;
      window.removeEventListener(ACK_EVENT, onAck);
    };
  }, []);
  const ack = useCallback(async () => {
    const r = await fetch("/api/needs-survey/director-view", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack" }),
    });
    if (!r.ok) throw new Error("保存に失敗しました");
    const prev = await load();
    cache = Promise.resolve({ ...prev, showNotice: false });
    window.dispatchEvent(new Event(ACK_EVENT));
  }, []);
  return [v, ack];
}

function NoticeBody({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-gray-900">
      {text.split("\n").map((l, i) => (l.trim() ? <p key={i}>{l}</p> : null))}
    </div>
  );
}

/** 画面の中に出す形（欲求サーベイの画面） */
export function NeedsDirectorNoticeInline() {
  const [v, ack] = useNeedsDirectorView();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!v?.showNotice || !v.texts) return null;
  return (
    <div className="space-y-2 rounded-md border border-indigo-300 bg-indigo-50 p-3" role="status" data-needs-director-notice="inline">
      <NoticeBody text={v.texts.notice} />
      {err && <p className="text-xs text-red-700">{err}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await ack();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "保存に失敗しました");
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-[40px] rounded-full bg-indigo-700 px-4 text-sm text-white disabled:opacity-50"
        data-needs-director-ack
      >
        {NEEDS_DIRECTOR_ACK_BUTTON}
      </button>
    </div>
  );
}

/** どの画面でも1回出す小窓（確認するまで、開くたびに出る。閉じるには「確認しました」） */
export function NeedsDirectorNoticeDialog() {
  const [v, ack] = useNeedsDirectorView();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!v?.showNotice || !v.texts) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" data-needs-director-notice="dialog">
      <div role="dialog" aria-modal="true" aria-label="欲求サーベイの見え方のお知らせ" className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-base font-bold text-gray-900">🧭 お知らせ</p>
        <NoticeBody text={v.texts.notice} />
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await ack();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "保存に失敗しました");
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-[44px] rounded-full bg-indigo-700 px-5 text-sm text-white disabled:opacity-50"
            data-needs-director-ack
          >
            {NEEDS_DIRECTOR_ACK_BUTTON}
          </button>
        </div>
      </div>
    </div>
  );
}
