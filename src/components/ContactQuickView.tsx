"use client";
// 📇 名前の横の連絡先（指示書188 5）
//   押すと小窓: 電話（タップで発信）・メール（タップで作成）・住所・緊急連絡先、下に「連絡先のページを開く」
//   **ボタンは連絡先を見る権限がある人（院長・169で閲覧を指名された人）にだけ描画する**（呼び出し側が contactAccess で判定）。
//   中身は 169 の API（/api/staff-contacts?user=）から取り、権限の判定はサーバーが行う。ブラウザの保存領域には書かない。

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StaffContact } from "@/lib/staff-contacts";

export function ContactQuickView({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ contact: StaffContact | null; error: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/staff-contacts?user=${encodeURIComponent(userId)}`, { cache: "no-store", credentials: "same-origin" });
        const j = (await res.json().catch(() => ({}))) as { contact?: StaffContact | null; error?: string };
        if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
        if (alive) setState({ contact: j.contact ?? null, error: "" });
      } catch (e) {
        if (alive) setState({ contact: null, error: e instanceof Error ? e.message : "読み込みに失敗しました" });
      }
    })();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, userId]);

  const c = state?.contact ?? null;
  const tel = (v: string) => v.replace(/[^\d+]/g, "");

  return (
    <span className="relative inline-block align-middle ml-2" ref={ref} data-contact-quick>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] px-2 py-1 rounded-full border border-teal-300 text-teal-800 bg-white hover:bg-teal-50 font-normal min-h-[28px]"
        data-contact-quick-button
      >
        📇 連絡先
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-lg p-3 text-left font-normal space-y-1.5" role="dialog" aria-label={`${name} さんの連絡先`} data-contact-quick-panel>
          {!state ? (
            <p className="text-[11px] text-gray-500">読み込み中…</p>
          ) : state.error ? (
            <p className="text-[11px] text-red-700">{state.error}</p>
          ) : !c ? (
            <p className="text-[11px] text-gray-500">連絡先はまだ登録されていません。</p>
          ) : (
            <>
              <p className="text-[12px] text-gray-900 font-medium">{c.name}</p>
              {c.phoneMobile && (
                <p className="text-[12px]">
                  📱 <a href={`tel:${tel(c.phoneMobile)}`} className="text-teal-800 underline underline-offset-2">{c.phoneMobile}</a>
                </p>
              )}
              {c.phoneHome && (
                <p className="text-[12px]">
                  ☎️ <a href={`tel:${tel(c.phoneHome)}`} className="text-teal-800 underline underline-offset-2">{c.phoneHome}</a>
                </p>
              )}
              {c.privateEmail && (
                <p className="text-[12px] break-all">
                  ✉️ <a href={`mailto:${c.privateEmail}`} className="text-teal-800 underline underline-offset-2">{c.privateEmail}</a>
                </p>
              )}
              {c.address && <p className="text-[11px] text-gray-800">🏠 {c.address}</p>}
              {c.emergency.length > 0 && (
                <div className="text-[11px] text-gray-800">
                  <p className="text-[10px] text-gray-500">🚨 緊急連絡先</p>
                  {c.emergency.map((e, i) => (
                    <p key={i}>
                      {e.name}
                      {e.relation ? `（${e.relation}）` : ""}{" "}
                      {e.phone && (
                        <a href={`tel:${tel(e.phone)}`} className="text-teal-800 underline underline-offset-2">{e.phone}</a>
                      )}
                    </p>
                  ))}
                </div>
              )}
              {!c.phoneMobile && !c.phoneHome && !c.privateEmail && !c.address && c.emergency.length === 0 && <p className="text-[11px] text-gray-500">電話・メール・住所はまだ登録されていません。</p>}
            </>
          )}
          <Link href="/staff-contacts" className="block text-[11px] text-teal-800 underline underline-offset-2 pt-1 border-t border-gray-100">
            連絡先のページを開く →
          </Link>
        </div>
      )}
    </span>
  );
}
