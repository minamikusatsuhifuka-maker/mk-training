"use client";

// スタッフ個人シート §4: 面談メモ（院長・メンバーノートの閲覧者だけ／本人には出さない）
//
// 新しい保存先は作らない。メンバーノート（指示書149）の「強みの記録」と「そのほかのメモ」を、
// その人のシートに出すだけ。見られるかは /api/member-notes の判定（authorizeMemberNotes＝管理者と
// 指定された閲覧者）そのままで、404 のときは**欄ごと出さない**（空の欄も出さない）。
// 直したらメンバーノートに保存する＝記録はメンバーノートの1か所だけ。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MEMO_MAX, emptyNote, normalizeMemberNote, type MemberNote } from "@/lib/member-notes";

export function SheetMemberNotePanel({ userId }: { userId: string }) {
  const [note, setNote] = useState<MemberNote | null>(null);
  const [visible, setVisible] = useState(false);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/member-notes", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) {
        setVisible(false); // 404＝見られない人。503（表が無い）も出さない
        return;
      }
      const j = (await res.json()) as { notes?: unknown[]; tableMissing?: boolean };
      if (j.tableMissing) {
        setVisible(false);
        return;
      }
      const raw = (j.notes ?? []).find(
        (n) => !!n && typeof n === "object" && (n as { staffUserId?: unknown }).staffUserId === userId
      );
      const n = (raw ? normalizeMemberNote(userId, raw) : null) ?? emptyNote(userId);
      setNote(n);
      setMemo(n.memo);
      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!visible || !note) return null;

  const dirty = memo !== note.memo;
  const save = async () => {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/member-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...note, memo }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "保存に失敗しました");
      setNote({ ...note, memo });
      setMsg("💾 メンバーノートに保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 space-y-3" aria-labelledby="sheet-memo" data-sheet-member-note>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sheet-memo" className="text-[15px] font-bold text-gray-900">面談メモ</h2>
        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] text-violet-900">
          🔒 院長・メンバーノートの閲覧者のみ　本人には表示されません
        </span>
      </div>

      {note.strengths.trim() && (
        <div className="space-y-1">
          <p className="text-[12px] font-bold text-gray-700">強みの記録</p>
          <p className="text-[13px] leading-relaxed text-gray-900 whitespace-pre-wrap">{note.strengths}</p>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={`sheet-memo-${userId}`} className="text-[12px] text-gray-600">
          そのほかのメモ（ここで直すとメンバーノートも変わります）
        </label>
        <textarea
          id={`sheet-memo-${userId}`}
          value={memo}
          maxLength={MEMO_MAX}
          rows={4}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="min-h-[40px] rounded-lg bg-teal-700 px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <Link href="/member-notes" className="min-h-[40px] inline-flex items-center text-[12px] text-teal-800 underline underline-offset-2">
          メンバーノートで開く
        </Link>
        {note.updatedAt && <span className="text-[11px] text-gray-500">最終更新 {note.updatedAt.slice(0, 10).replaceAll("-", "/")}</span>}
      </div>
      {msg && <p className="text-[12px] text-teal-800">{msg}</p>}
      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <p className="text-[11px] text-gray-500">1on1の「ウェルネスの視点」は、1on1のタブにあります（院長・担当の幹部だけ）。</p>
    </section>
  );
}
