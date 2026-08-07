"use client";

// 資料からの取り込み（指示書150）
// AIは**提案を作るだけ**。ここで院長が項目ごとに「追記／置換／反映しない」を選び、
// 「反映」を押したときにだけ既存の保存API（PUT /api/member-notes）を呼ぶ。
// アップロードしたファイルはサーバーで解析後に破棄され、どこにも保存されない。

import { useRef, useState } from "react";
import {
  emptyNote,
  type MemberNote,
} from "@/lib/member-notes";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

type Proposal = {
  sourceFile: string;
  readName: string;
  staffUserId: string | null;
  confidence: "high" | "low";
  birthday: string;
  joinedOn: string;
  strengths: string;
  memo: string;
  note: string;
};

/** 項目ごとの反映のしかた */
type Mode = "skip" | "append" | "replace";

type Draft = Proposal & {
  targetUserId: string;
  modes: { birthday: Mode; joinedOn: Mode; strengths: Mode; memo: Mode };
  applied: boolean;
};

const FIELDS = [
  { key: "birthday", label: "誕生日", textarea: false },
  { key: "joinedOn", label: "入職日", textarea: false },
  { key: "strengths", label: "強みの記録", textarea: true },
  { key: "memo", label: "メモ", textarea: true },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

/** 日付は追記ができないので、既存値があるときの既定は「反映しない」にする */
function defaultMode(key: FieldKey, proposed: string, current: string): Mode {
  if (!proposed) return "skip";
  if (!current) return "replace";
  return key === "strengths" || key === "memo" ? "append" : "skip";
}

function merged(current: string, proposed: string, mode: Mode): string {
  if (mode === "skip" || !proposed) return current;
  if (mode === "replace") return proposed;
  return current ? `${current}\n\n${proposed}` : proposed;
}

export function MemberNotesImportPanel({
  members,
  noteOf,
  onApplied,
}: {
  members: StaffProfileIndexEntry[];
  noteOf: (userId: string) => MemberNote;
  onApplied: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const analyze = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      fd.append(
        "members",
        JSON.stringify(members.map((m) => ({ userId: m.userId, name: m.name })))
      );
      const res = await fetch("/api/member-notes/parse", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "解析に失敗しました");
      const list = (json.proposals as Proposal[]) ?? [];
      setDrafts(
        list.map((p) => {
          const target = p.staffUserId ?? "";
          const cur = target ? noteOf(target) : emptyNote("");
          return {
            ...p,
            targetUserId: target,
            modes: {
              birthday: defaultMode("birthday", p.birthday, cur.birthday),
              joinedOn: defaultMode("joinedOn", p.joinedOn, cur.joinedOn),
              strengths: defaultMode("strengths", p.strengths, cur.strengths),
              memo: defaultMode("memo", p.memo, cur.memo),
            },
            applied: false,
          };
        })
      );
      setMsg(
        `${list.length}件を読み取りました。内容を確認して「反映」を押すと保存されます（押すまでは保存されません）。`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析に失敗しました");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, k) => (k === i ? { ...d, ...patch } : d)));

  const setMode = (i: number, key: FieldKey, mode: Mode) =>
    setDrafts((prev) =>
      prev.map((d, k) =>
        k === i ? { ...d, modes: { ...d.modes, [key]: mode } } : d
      )
    );

  const apply = async (i: number) => {
    const d = drafts[i];
    if (!d.targetUserId) {
      setError("メンバーを選んでください");
      return;
    }
    const cur = noteOf(d.targetUserId);
    const next: MemberNote = {
      ...cur,
      staffUserId: d.targetUserId,
      birthday: merged(cur.birthday, d.birthday, d.modes.birthday),
      joinedOn: merged(cur.joinedOn, d.joinedOn, d.modes.joinedOn),
      strengths: merged(cur.strengths, d.strengths, d.modes.strengths),
      memo: merged(cur.memo, d.memo, d.modes.memo),
    };
    const name =
      members.find((m) => m.userId === d.targetUserId)?.name ?? "この方";
    if (!confirm(`${name}のノートに反映します。よろしいですか？`)) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/member-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setDraft(i, { applied: true });
      setMsg(`✅ ${name}のノートに反映しました`);
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const discardAll = () => {
    if (drafts.length > 0 && !confirm("読み取った内容をすべて破棄しますか？")) {
      return;
    }
    setDrafts([]);
    setMsg("");
    setError("");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-gray-900">
          📤 資料から取り込む
          <span className="ml-2 text-xs font-normal text-gray-600">
            画像・PDF・Word をAIが読み取って下書きにします
          </span>
        </span>
        <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">
            強み診断の結果画面・面談メモ・プロフィールシートなどを選んでください（複数可）。
            <strong>
              AIは下書きを作るだけで、保存はしません。
            </strong>
            内容を確かめて「反映」を押したものだけがノートに入ります。
            <br />
            アップロードしたファイルは<strong>解析が終わり次第そのまま破棄</strong>
            され、どこにも保存されません。
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx"
            onChange={(e) => analyze(e.target.files)}
            disabled={busy}
            className="block w-full text-sm text-gray-700 file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-teal-600 file:text-white file:text-sm hover:file:bg-teal-700 disabled:opacity-40"
          />
          {busy && <p className="text-xs text-gray-600">処理中です…</p>}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </p>
          )}
          {msg && (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">
              {msg}
            </p>
          )}

          {drafts.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={discardAll}
                className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50"
              >
                読み取り結果を破棄
              </button>
            </div>
          )}

          {drafts.map((d, i) => {
            const cur = d.targetUserId ? noteOf(d.targetUserId) : emptyNote("");
            return (
              <div
                key={`${d.sourceFile}-${i}`}
                className={`p-3 rounded-xl border ${
                  d.applied
                    ? "bg-gray-50 border-gray-200 opacity-70"
                    : "bg-white border-gray-200"
                }`}
              >
                <p className="text-xs text-gray-600 break-all">
                  📄 {d.sourceFile}
                  {d.readName && `　読み取った氏名: ${d.readName}`}
                </p>
                {d.note && (
                  <p className="text-xs text-amber-700 mt-1">⚠ {d.note}</p>
                )}
                {d.confidence === "low" && d.staffUserId && (
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠ 突合が曖昧です。メンバーが合っているか確認してください。
                  </p>
                )}

                <div className="mt-2">
                  <label className="text-xs text-gray-600 mr-2">
                    反映先メンバー
                  </label>
                  <select
                    value={d.targetUserId}
                    onChange={(e) =>
                      setDraft(i, { targetUserId: e.target.value })
                    }
                    disabled={d.applied}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="">（未割り当て — 選んでください）</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 space-y-3">
                  {FIELDS.map((f) => {
                    const proposed = d[f.key];
                    if (!proposed) return null;
                    const current = cur[f.key];
                    const mode = d.modes[f.key];
                    return (
                      <div
                        key={f.key}
                        className="border border-gray-100 rounded-lg p-2"
                      >
                        <p className="text-xs font-medium text-gray-800 mb-1">
                          {f.label}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <p className="text-[11px] text-gray-500 mb-0.5">
                              現在の値
                            </p>
                            <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 min-h-[2rem]">
                              {current || "（未記入）"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500 mb-0.5">
                              AIの提案（編集できます）
                            </p>
                            {f.textarea ? (
                              <textarea
                                value={proposed}
                                onChange={(e) =>
                                  setDraft(i, { [f.key]: e.target.value } as Partial<Draft>)
                                }
                                disabled={d.applied}
                                rows={4}
                                className="w-full text-xs border border-gray-200 rounded p-2"
                              />
                            ) : (
                              <input
                                type="date"
                                value={proposed}
                                onChange={(e) =>
                                  setDraft(i, { [f.key]: e.target.value } as Partial<Draft>)
                                }
                                disabled={d.applied}
                                className="w-full text-xs border border-gray-200 rounded p-2"
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {(
                            [
                              ["skip", "反映しない"],
                              ["append", "追記する"],
                              ["replace", "置き換える"],
                            ] as const
                          ).map(([v, label]) => (
                            <label
                              key={v}
                              className={`text-xs flex items-center gap-1 cursor-pointer ${
                                v === "append" && !f.textarea
                                  ? "opacity-40 pointer-events-none"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                name={`${f.key}-${i}`}
                                checked={mode === v}
                                onChange={() => setMode(i, f.key, v)}
                                disabled={d.applied}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3">
                  {d.applied ? (
                    <p className="text-xs text-teal-800">✅ 反映済み</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(i)}
                      disabled={busy || !d.targetUserId}
                      className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
                    >
                      ✅ このメンバーに反映
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
