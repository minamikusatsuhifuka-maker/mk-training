"use client";

// 📣 参加の確定（指示書228 §3）— イベントの画面と管理画面「📣 イベントの参加記録」で同じ部品を使う
// 確定の前は「出席」と答えた人が最初から選ばれている。来なかった人を外す・答えずに来た人を足す → 確定。
// 開ける人の判定はサーバー（/api/notices/attendance が 404 を返したら何も出さない）。

import { useEffect, useMemo, useState } from "react";
import { fetchAttendanceEdit, saveAttendanceEdit, type AttendanceEditResponse } from "@/lib/notices-client";
import { RSVP_LABEL, formatHeld } from "@/lib/notices";

const RSVP_TONE: Record<string, string> = {
  yes: "bg-teal-50 text-teal-800 border-teal-200",
  no: "bg-gray-50 text-gray-600 border-gray-200",
  none: "bg-amber-50 text-amber-800 border-amber-200",
};

export function AttendanceEditor({
  noticeId,
  onSaved,
  onClose,
  showTitle = false,
}: {
  noticeId: string;
  onSaved?: (count: number) => void;
  onClose?: () => void;
  showTitle?: boolean;
}) {
  const [data, setData] = useState<AttendanceEditResponse | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    fetchAttendanceEdit(noticeId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setPicked(new Set(d.selected));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [noticeId]);

  const groups = useMemo(() => {
    const c = data?.candidates ?? [];
    return [
      { key: "yes", label: "「出席」と答えた人", rows: c.filter((x) => x.rsvp === "yes") },
      { key: "none", label: "まだ答えていない人", rows: c.filter((x) => x.rsvp === "none") },
      { key: "no", label: "「欠席」と答えた人", rows: c.filter((x) => x.rsvp === "no") },
    ].filter((g) => g.rows.length > 0);
  }, [data]);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!data) return <p className="text-xs text-gray-500">読み込み中…</p>;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError("");
    setDone("");
    try {
      const r = await saveAttendanceEdit(noticeId, Array.from(picked));
      setDone(`${r.count}人を参加として記録しました`);
      setData({ ...data, confirmed: true, confirmedAt: r.confirmedAt });
      onSaved?.(r.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-attendance-editor>
      {showTitle && (
        <p className="text-sm font-medium text-gray-900">
          {data.title}
          <span className="ml-2 text-xs text-gray-500">{formatHeld(data)}</span>
        </p>
      )}
      <p className="text-xs text-gray-600 leading-relaxed">
        {data.confirmed
          ? "確定済みです。来なかった人を外す・答えずに来た人を足すことができます（直せるのは院長と指定した幹部だけ）。"
          : "「出席」と答えた人が最初から選ばれています。来なかった人を外し、答えずに来た人を足してから確定してください。確定のあとに直せるのは院長と指定した幹部だけです。"}
      </p>
      {groups.map((g) => (
        <div key={g.key} className="space-y-1">
          <p className="text-[11px] font-medium text-gray-500">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.rows.map((c) => {
              const on = picked.has(c.userId);
              return (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => toggle(c.userId)}
                  aria-pressed={on}
                  className={`min-h-[36px] rounded-full border px-3 text-xs ${
                    on ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 bg-white text-gray-700"
                  }`}
                  data-attendance-pick={c.userId}
                >
                  {on ? "✓ " : ""}
                  {c.name}
                  <span className={`ml-1.5 rounded border px-1 text-[10px] ${on ? "border-white/40 text-white" : RSVP_TONE[c.rsvp]}`}>
                    {RSVP_LABEL[c.rsvp]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {data.candidates.length === 0 && <p className="text-xs text-gray-500">出欠をとる相手がいません。</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-[40px] rounded-lg bg-teal-700 px-4 text-sm font-medium text-white disabled:opacity-50"
          data-attendance-save
        >
          {saving ? "保存中…" : data.confirmed ? `直す（${picked.size}人）` : `参加を確定する（${picked.size}人）`}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm text-gray-700">
            閉じる
          </button>
        )}
        {done && <span className="text-xs text-teal-700">{done}</span>}
      </div>
    </div>
  );
}
