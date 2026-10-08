"use client";

// 1on1の録音・書き起こしの同意の印（指示書221 §1）
//
// ・院長だけが、スタッフごとに印を付け外しできる（canEdit）。判定はサーバー側（API）
// ・本人の画面（マイ成長記録）では、自分の印の状態だけを読み取り専用で出す
// ・印が無いスタッフの1on1は取り込めない（院長・幹部とも）

import { useCallback, useEffect, useState } from "react";
import { consentNoticeForOwner } from "@/lib/one-on-one-transcript";

type State = { on: string } | null;

export function TranscriptConsentPanel({
  userId,
  staffName,
  canEdit = false,
  /** 本人の画面（自分の印を読むだけ） */
  selfView = false,
}: {
  userId?: string;
  staffName?: string;
  canEdit?: boolean;
  selfView?: boolean;
}) {
  const [consent, setConsent] = useState<State>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = userId ? `?user=${encodeURIComponent(userId)}` : "";
      const res = await fetch(`/api/one-on-one/transcript-consent${q}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setHidden(true); // 読めない人には何も出さない
        return;
      }
      const j = (await res.json()) as { consent?: State };
      setConsent(j.consent ?? null);
    } catch {
      setHidden(true);
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/one-on-one/transcript-consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ userId, consented: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { consent?: State; error?: string };
      if (!res.ok) throw new Error(j.error || "保存できませんでした");
      setConsent(j.consent ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  if (hidden || !loaded) return null;

  // 本人の画面（読むだけ）
  if (selfView) {
    return (
      <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5" data-transcript-consent-self>
        🎙 {consentNoticeForOwner(consent?.on ?? "")}
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5" data-transcript-consent>
      <h2 className="text-sm font-medium text-gray-900">🎙 1on1の録音・書き起こし</h2>
      <p className="text-[11px] text-gray-600">
        スタッフへの説明で同意を得たら、ここに印を付けます（毎回の確認はしません）。
        印がないスタッフの1on1は、書き起こしから記録できません。
      </p>
      <p className="text-[12px] text-gray-900" data-transcript-consent-state={consent ? "on" : "off"}>
        {consent
          ? `同意あり（${consent.on.replaceAll("-", "/")}）`
          : `同意の印はまだありません${staffName ? `（${staffName}さん）` : ""}`}
      </p>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      {canEdit && (
        <button
          type="button"
          onClick={() => void toggle(!consent)}
          disabled={busy}
          className={`px-3 py-1.5 rounded-full text-[12px] min-h-[36px] disabled:opacity-40 ${
            consent
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-teal-600 text-white hover:bg-teal-700"
          }`}
          data-transcript-consent-toggle
        >
          {busy ? "保存しています…" : consent ? "印を外す" : "✔ 同意ありの印を付ける（今日）"}
        </button>
      )}
    </section>
  );
}
