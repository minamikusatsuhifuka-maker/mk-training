"use client";

// 採用資料・経歴・入職時の想い（指示書184）— 育成カルテの個人画面の中・**院長のみ**描画される
// - 資料の登録（PDF・JPEG・PNG。iPhoneのHEICは端末側でJPEGに変換）／一覧／1タップで開く（10分の署名URLをその都度発行）／削除（確認あり）
// - 🪄 AIで内容を整理: 提案（根拠つき）を現在の登録値と並べ、項目ごとに「反映する」を選んで保存。既存値は既定で上書きしない
//   有料枠の設定（179）がOFFのときはボタンを無効表示
// - 経歴・入職時の想い: 院長が直接編集できる

import { useCallback, useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import {
  CONTACT_FIELD_LABEL,
  CONTACT_PROPOSAL_KEYS,
  HIRING_DOC_KINDS,
  HIRING_DOC_MAX_BYTES,
  HIRING_PROFILE_FIELDS,
  hiringDocKindLabel,
  type ContactProposalKey,
  type HiringApplyInput,
  type HiringDoc,
  type HiringDocKind,
  type HiringLog,
  type HiringProfile,
  type HiringProfileText,
  type HiringProposal,
} from "@/lib/hiring-docs";
import type { StaffContact } from "@/lib/staff-contacts";
import { PHOTO_MAX_EDGE, resizeImageToJpeg } from "@/lib/image-resize";

type ListResponse = {
  docs: HiringDoc[];
  profile: HiringProfile;
  logs: HiringLog[];
  tableMissing: boolean;
  bucketMissing: boolean;
  aiEnabled: boolean;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: { ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

export function HiringDocsPanel({ userId, staffName }: { userId: string; staffName: string }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 186: 複数ファイルをまとめて受け取り、1件ずつ種類・日付・メモを編集してから登録する
  type QueueRow = { key: string; file: File; kind: HiringDocKind; docDate: string; memo: string; reason: string; state: "ready" | "busy" | "done" };
  const [queue, setQueue] = useState<QueueRow[]>([]);
  // 直前に選んでいた種類・日付を次の行の初期値にする（A-2）
  const [lastKind, setLastKind] = useState<HiringDocKind>("resume");
  const [lastDate, setLastDate] = useState("");
  const addFiles = (files: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...files.map((f, i) => {
        const mime = f.type === "image/jpg" ? "image/jpeg" : f.type;
        const isImage = mime.startsWith("image/");
        let reason = "";
        if (!(mime === "application/pdf" || isImage)) reason = "対象外の形式です（PDF・JPEG・PNG・写真のみ）";
        else if (f.size === 0) reason = "空のファイルです";
        else if (f.size > HIRING_DOC_MAX_BYTES) reason = "20MBを超えています";
        return { key: `${Date.now()}-${i}-${f.name}`, file: f, kind: lastKind, docDate: lastDate, memo: "", reason, state: "ready" as const };
      }),
    ]);
  };
  const setRow = (key: string, patch: Partial<QueueRow>) => setQueue((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const [viewer, setViewer] = useState<{ url: string; mimeType: string; fileName: string; text?: string } | null>(null);
  // 187 B: 文章の貼り付け（面接の記録など）
  const [pasteText, setPasteText] = useState("");
  const [pasteKind, setPasteKind] = useState<HiringDocKind>("interview");
  const [pasteDate, setPasteDate] = useState("");
  const [pasteMemo, setPasteMemo] = useState("");
  // 187 A: 反映の取り消し（直前の値を1回分だけ保持）
  const [undo, setUndo] = useState<{ userId: string; contact?: unknown; profile?: unknown; applied: string[] } | null>(null);
  const [profileDraft, setProfileDraft] = useState<HiringProfileText | null>(null);
  const [extract, setExtract] = useState<{ docId: string; proposal: HiringProposal; current: { contact: StaffContact; profile: HiringProfile } } | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await api<ListResponse>(`/api/admin/hiring?user=${encodeURIComponent(userId)}`);
      setData(j);
      setProfileDraft({ education: j.profile.education, career: j.profile.career, licenses: j.profile.licenses, motivation: j.profile.motivation, selfPr: j.profile.selfPr });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };

  // ─── 登録（行ごと。対象外の行は登録せず、他の行は止めない・A-2） ───
  const uploadRow = async (row: QueueRow) => {
    if (row.reason || row.state !== "ready") return;
    setRow(row.key, { state: "busy" });
    setError("");
    try {
      let blob: Blob = row.file;
      let name = row.file.name;
      // 画像はJPEGに変換（HEIC・大きな写真対策）。PDF・PNGはそのまま
      if (row.file.type !== "application/pdf" && row.file.type !== "image/png") {
        try {
          blob = await resizeImageToJpeg(row.file, PHOTO_MAX_EDGE * 2, 0.9);
          name = name.replace(/\.[^.]+$/, "") + ".jpg";
        } catch {
          setRow(row.key, { state: "ready", reason: "この端末では画像を変換できません（JPEG か PNG で登録してください）" });
          return;
        }
      }
      const form = new FormData();
      form.set("userId", userId);
      form.set("kind", row.kind);
      form.set("docDate", row.docDate);
      form.set("memo", row.memo);
      form.set("file", blob, name);
      const { doc } = await api<{ doc: HiringDoc }>("/api/admin/hiring", { method: "POST", body: form });
      setData((d) => (d ? { ...d, docs: [doc, ...d.docs] } : d));
      setLastKind(row.kind);
      setLastDate(row.docDate);
      setQueue((prev) => prev.filter((r) => r.key !== row.key));
      flash(`📁 ${row.file.name} を登録しました`);
    } catch (e) {
      setRow(row.key, { state: "ready", reason: e instanceof Error ? e.message : "登録に失敗しました" });
    }
  };
  const uploadAll = async () => {
    setBusy(true);
    try {
      for (const row of queue) if (!row.reason && row.state === "ready") await uploadRow(row);
    } finally {
      setBusy(false);
    }
  };

  const open = async (doc: HiringDoc) => {
    setError("");
    try {
      const j = await api<{ url: string; mimeType: string; fileName: string }>(`/api/admin/hiring/file?id=${encodeURIComponent(doc.id)}`);
      if (j.mimeType === "text/plain") {
        const text = await fetch(j.url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
        setViewer({ ...j, text });
      } else {
        setViewer(j);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "開けませんでした");
    }
  };

  // 187 B: 文章を .txt として登録
  const uploadText = async () => {
    if (!pasteText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("userId", userId);
      form.set("kind", pasteKind);
      form.set("docDate", pasteDate);
      form.set("memo", pasteMemo);
      form.set("text", pasteText);
      const { doc } = await api<{ doc: HiringDoc }>("/api/admin/hiring", { method: "POST", body: form });
      setData((d) => (d ? { ...d, docs: [doc, ...d.docs] } : d));
      setPasteText("");
      setPasteMemo("");
      flash("📝 文章を資料として登録しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const undoApply = async () => {
    if (!undo) return;
    if (!confirm(`直前の反映（${undo.applied.join("・")}）を取り消して、前の値に戻します。よろしいですか？`)) return;
    setBusy(true);
    setError("");
    try {
      const { userId: uid, contact, profile } = undo;
      const body: Record<string, unknown> = { userId: uid };
      if (contact !== undefined) body.contact = contact;
      if (profile !== undefined) body.profile = profile;
      await api("/api/admin/hiring/apply", { method: "POST", body: JSON.stringify({ undo: body }) });
      setUndo(null);
      flash("↩ 直前の反映を取り消しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り消しに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: HiringDoc) => {
    if (!confirm(`${hiringDocKindLabel(doc.kind)}（${doc.fileName}）を削除します。\n\n削除すると元に戻せません。よろしいですか？`)) return;
    setBusy(true);
    try {
      await api("/api/admin/hiring", { method: "DELETE", body: JSON.stringify({ id: doc.id }) });
      setData((d) => (d ? { ...d, docs: d.docs.filter((x) => x.id !== doc.id) } : d));
      flash("🗑 資料を削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!profileDraft) return;
    setBusy(true);
    try {
      const { profile } = await api<{ profile: HiringProfile }>("/api/admin/hiring", { method: "PATCH", body: JSON.stringify({ userId, profile: profileDraft }) });
      setData((d) => (d ? { ...d, profile } : d));
      flash("💾 経歴・入職時の想いを保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const runExtract = async (doc: HiringDoc) => {
    setBusy(true);
    setError("");
    try {
      const j = await api<{ proposal: HiringProposal; current: { contact: StaffContact; profile: HiringProfile } }>("/api/admin/hiring/extract", { method: "POST", body: JSON.stringify({ id: doc.id }) });
      setExtract({ docId: doc.id, proposal: j.proposal, current: j.current });
      flash("🪄 提案を作りました。反映する項目を選んでください（保存はまだされていません）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI整理に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <section id="hiring" className="rounded-xl border border-orange-200 bg-orange-50/30 p-3">
        <h2 className="text-sm font-medium text-gray-900">📁 採用資料（院長のみ）</h2>
        <p className="text-[11px] text-gray-500 mt-1">{error || "読み込み中…"}</p>
      </section>
    );
  }

  return (
    <section id="hiring" className="rounded-xl border border-orange-200 bg-orange-50/30 p-3 space-y-3" data-hiring-panel>
      <div>
        <h2 className="text-sm font-medium text-gray-900">📁 採用資料・経歴（院長のみ）</h2>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          履歴書・適性検査などの原本はここに登録した院長だけが見られます（幹部には出ません）。閲覧のリンクは10分で切れます。退職しても自動では消しません。
        </p>
      </div>
      {data.tableMissing && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          採用資料のテーブルがまだ作られていません。<code className="mx-1">~/Downloads/184_採用資料_テーブル作成.sql</code> を実行してください。
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* 登録（186: ドラッグ＆ドロップ＋複数ファイル） */}
      <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2" data-hiring-upload>
        <p className="text-[11px] font-medium text-gray-800">＋ 資料を登録（PDF・JPEG・PNG・20MBまで。iPhoneの写真も可）</p>
        <DropZone
          testId="hiring"
          accept="application/pdf,image/*"
          disabled={busy}
          onFiles={addFiles}
          label="ここにファイルをドラッグ＆ドロップ（複数可）"
          hint="iPhone・iPad は「ファイルを選択」から"
        />
        {queue.length > 0 && (
          <ul className="space-y-2" data-hiring-queue>
            {queue.map((row) => (
              <li key={row.key} className={`rounded-md border p-2 space-y-1.5 ${row.reason ? "border-red-200 bg-red-50/40" : "border-gray-200"}`} data-queue-row data-rejected={row.reason ? "1" : "0"}>
                <p className="text-[11px] text-gray-800 truncate">
                  📄 {row.file.name} <span className="text-gray-500">（{Math.round(row.file.size / 1024)} KB）</span>
                </p>
                {row.reason ? (
                  <p className="text-[11px] text-red-700" data-reject-reason>{row.reason}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select value={row.kind} onChange={(e) => setRow(row.key, { kind: e.target.value as HiringDocKind })} className={inputClass} aria-label="資料の種類">
                      {HIRING_DOC_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <input type="date" value={row.docDate} onChange={(e) => setRow(row.key, { docDate: e.target.value })} className={inputClass} aria-label="資料の日付" />
                    <input value={row.memo} onChange={(e) => setRow(row.key, { memo: e.target.value })} placeholder="メモ（任意）" className={inputClass} aria-label="メモ" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {!row.reason && (
                    <button type="button" onClick={() => void uploadRow(row)} disabled={busy || row.state !== "ready"} className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-xs hover:bg-teal-700 disabled:opacity-40 min-h-[36px]">
                      {row.state === "busy" ? "登録中…" : "📁 この1件を登録"}
                    </button>
                  )}
                  <button type="button" onClick={() => setQueue((prev) => prev.filter((r) => r.key !== row.key))} disabled={row.state === "busy"} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 min-h-[36px]">
                    外す
                  </button>
                </div>
              </li>
            ))}
            {queue.filter((r) => !r.reason && r.state === "ready").length > 1 && (
              <li>
                <button type="button" onClick={() => void uploadAll()} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]">
                  📁 登録できる {queue.filter((r) => !r.reason && r.state === "ready").length} 件をまとめて登録
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 187 B: 文章の貼り付け（面接の記録・院長のメモ・議事録） */}
      <details className="rounded-lg border border-gray-200 bg-white p-2" data-hiring-paste>
        <summary className="text-[11px] font-medium text-gray-800 cursor-pointer min-h-[32px] flex items-center">📝 文章を貼り付けて登録（面接の記録・メモ）</summary>
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            貼り付けた文章は .txt として同じ非公開の保管庫に入り、院長だけが見られます。AI整理では<strong>本人が述べた事実だけ</strong>を取り出し、院長の所感・評価は取り出しません。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={pasteKind} onChange={(e) => setPasteKind(e.target.value as HiringDocKind)} className={inputClass} aria-label="文章の種類">
              {HIRING_DOC_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input type="date" value={pasteDate} onChange={(e) => setPasteDate(e.target.value)} className={inputClass} aria-label="文章の日付" />
            <input value={pasteMemo} onChange={(e) => setPasteMemo(e.target.value)} placeholder="メモ（任意）" className={inputClass} aria-label="文章のメモ" />
          </div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder="面接の記録・議事録などを貼り付け（2万字まで）" className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white" aria-label="貼り付ける文章" />
          <button type="button" onClick={() => void uploadText()} disabled={busy || !pasteText.trim()} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]">
            📝 文章を登録
          </button>
        </div>
      </details>

      {undo && (
        <div className="rounded-lg border border-teal-300 bg-teal-50 p-2 flex flex-wrap items-center justify-between gap-2" data-hiring-undo>
          <p className="text-[11px] text-teal-900">✅ 反映しました: {undo.applied.join("・")}（直前の値を1回分だけ保持しています）</p>
          <button type="button" onClick={() => void undoApply()} disabled={busy} className="px-3 py-1.5 border border-teal-400 text-teal-900 rounded-full text-xs hover:bg-white disabled:opacity-40 min-h-[36px]">
            ↩ 取り消し
          </button>
        </div>
      )}

      {/* 一覧 */}
      {data.docs.length === 0 ? (
        <p className="text-[11px] text-gray-500">まだ資料がありません。</p>
      ) : (
        <ul className="space-y-1.5" aria-label="採用資料の一覧">
          {data.docs.map((d) => (
            <li key={d.id} className="rounded-lg border border-gray-200 bg-white p-2 flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[12px] text-gray-900">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-900 mr-1">{hiringDocKindLabel(d.kind)}</span>
                {d.docDate ? d.docDate.replaceAll("-", "/") : "日付なし"}
                <span className="block text-[11px] text-gray-600 truncate">
                  {d.fileName}
                  {d.memo ? ` ・ ${d.memo}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => void open(d)} className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[40px]">
                👁 開く
              </button>
              <button
                type="button"
                onClick={() => void runExtract(d)}
                disabled={busy || !data.aiEnabled}
                title={data.aiEnabled ? "" : "AI下書きの設定（有料枠の確認）がOFFのため実行できません（講座マスタ・設定でON）"}
                className="px-3 py-2 border border-violet-300 text-violet-800 rounded-full text-xs hover:bg-violet-50 disabled:opacity-40 min-h-[40px]"
              >
                🪄 AIで内容を整理
              </button>
              <button type="button" onClick={() => void remove(d)} disabled={busy} className="px-3 py-2 border border-red-300 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[40px]">
                🗑 削除
              </button>
            </li>
          ))}
        </ul>
      )}
      {!data.aiEnabled && data.docs.length > 0 && (
        <p className="text-[10px] text-gray-500" data-ai-disabled>
          🪄 AIで内容を整理は、179で院長が確認する「有料枠・学習に使われない契約」の設定がONのときだけ使えます（🗂 講座マスタ・設定）。
        </p>
      )}

      {/* ビューア */}
      {viewer && (
        <div className="rounded-lg border border-gray-300 bg-white p-2 space-y-1" data-hiring-viewer>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-700 truncate">{viewer.fileName}（リンクは10分で切れます）</p>
            <div className="flex gap-2">
              <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-teal-800 underline underline-offset-2">別タブで開く</a>
              <button type="button" onClick={() => setViewer(null)} className="text-[11px] text-gray-700 underline underline-offset-2">閉じる</button>
            </div>
          </div>
          {viewer.mimeType === "text/plain" ? (
            <pre className="whitespace-pre-wrap text-[12px] text-gray-900 bg-gray-50 rounded border border-gray-200 p-2 max-h-[60vh] overflow-auto">{viewer.text || "（読み込めませんでした）"}</pre>
          ) : viewer.mimeType === "application/pdf" ? (
            <iframe src={viewer.url} title={viewer.fileName} className="w-full h-[70vh] rounded border border-gray-200" />
          ) : (
            // 署名URLは短時間で切れるため next/image を通さない
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.url} alt={viewer.fileName} className="max-w-full rounded border border-gray-200" />
          )}
        </div>
      )}

      {/* AIの提案 */}
      {extract && (
        <ProposalReview
          userId={userId}
          staffName={staffName}
          proposal={extract.proposal}
          current={extract.current}
          busy={busy}
          onClose={() => setExtract(null)}
          onApplied={async (applied, undoSnap) => {
            setExtract(null);
            setUndo(undoSnap ? { ...undoSnap, applied } : null);
            flash(`✅ 反映しました（${applied.join("・") || "なし"}）`);
            await load();
          }}
          onError={(m) => setError(m)}
          setBusy={setBusy}
        />
      )}

      {/* 経歴・入職時の想い */}
      {profileDraft && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2" data-hiring-profile>
          <p className="text-[11px] font-medium text-gray-800">📜 経歴・入職時の想い（院長のみ）</p>
          {HIRING_PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] text-gray-700">
                {f.group}: {f.label}
              </span>
              <textarea
                value={profileDraft[f.key]}
                onChange={(e) => setProfileDraft((p) => (p ? { ...p, [f.key]: e.target.value } : p))}
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white mt-0.5"
              />
            </label>
          ))}
          <button type="button" onClick={() => void saveProfile()} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]">
            💾 保存
          </button>
        </div>
      )}

      {/* 操作ログ */}
      <div>
        <button type="button" onClick={() => setShowLogs((v) => !v)} className="text-[11px] text-gray-700 underline underline-offset-2 min-h-[32px]">
          {showLogs ? "▲ 操作ログを隠す" : `▼ 操作ログ（${data.logs.length}件・本文は記録しません）`}
        </button>
        {showLogs && (
          <ul className="text-[11px] text-gray-700 space-y-0.5 mt-1">
            {data.logs.map((l) => (
              <li key={l.id}>
                <span className="text-gray-500">{l.at.replace("T", " ").slice(0, 16)}</span> {l.by} が {l.action}
                {l.changes.length > 0 ? `（${l.changes.map((c) => `${c.field}: ${c.before || "—"} → ${c.after || "—"}`).join(" / ")}）` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── 提案の確認（3-1 ③④）───

type Pick = {
  contact: Record<ContactProposalKey, boolean>;
  emergency: boolean[];
  family: boolean[];
  profile: Record<keyof HiringProfileText, { on: boolean; mode: "replace" | "append" }>;
};

function ProposalReview({
  userId,
  staffName,
  proposal,
  current,
  busy,
  onClose,
  onApplied,
  onError,
  setBusy,
}: {
  userId: string;
  staffName: string;
  proposal: HiringProposal;
  current: { contact: StaffContact; profile: HiringProfile };
  busy: boolean;
  onClose: () => void;
  onApplied: (applied: string[], undo: { userId: string; contact?: unknown; profile?: unknown } | null) => Promise<void>;
  onError: (m: string) => void;
  setBusy: (b: boolean) => void;
}) {
  // 既定: 現在値が空の項目だけON（既存の値は既定で上書きしない）
  const [pick, setPick] = useState<Pick>(() => ({
    contact: Object.fromEntries(CONTACT_PROPOSAL_KEYS.map((k) => [k, !!proposal.contact[k] && !currentContactValue(current.contact, k)])) as Record<ContactProposalKey, boolean>,
    emergency: proposal.emergency.map(() => current.contact.emergency.length === 0),
    family: proposal.family.map(() => current.contact.family.length === 0),
    profile: Object.fromEntries(
      HIRING_PROFILE_FIELDS.map((f) => [f.key, { on: !!proposal.profile[f.key] && !current.profile[f.key].trim(), mode: "append" as const }])
    ) as Pick["profile"],
  }));

  const apply = async () => {
    const input: HiringApplyInput = { userId };
    const contact: NonNullable<HiringApplyInput["contact"]> = {};
    for (const k of CONTACT_PROPOSAL_KEYS) if (pick.contact[k] && proposal.contact[k]) contact[k] = proposal.contact[k]!.value;
    if (Object.keys(contact).length > 0) input.contact = contact;
    const emergency = proposal.emergency.filter((_, i) => pick.emergency[i]).map(({ name, relation, phone }) => ({ name, relation, phone }));
    if (emergency.length > 0) input.emergency = emergency;
    const family = proposal.family.filter((_, i) => pick.family[i]).map(({ relation, count }) => ({ relation, count }));
    if (family.length > 0) input.family = family;
    const profile: NonNullable<HiringApplyInput["profile"]> = {};
    for (const f of HIRING_PROFILE_FIELDS) {
      const p = proposal.profile[f.key];
      if (p && pick.profile[f.key].on) profile[f.key] = { value: p.value, mode: pick.profile[f.key].mode };
    }
    if (Object.keys(profile).length > 0) input.profile = profile;
    if (!input.contact && !input.emergency && !input.family && !input.profile) {
      onError("反映する項目が選ばれていません");
      return;
    }
    setBusy(true);
    try {
      const j = await api<{ applied: string[]; undo?: { userId: string; contact?: unknown; profile?: unknown } }>("/api/admin/hiring/apply", { method: "POST", body: JSON.stringify(input) });
      await onApplied(j.applied, j.undo ?? null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "反映に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const hasAny =
    Object.values(proposal.contact).some(Boolean) || proposal.emergency.length > 0 || proposal.family.length > 0 || Object.values(proposal.profile).some(Boolean) || !!proposal.testDate;

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/50 p-2 space-y-2" data-hiring-proposal>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-violet-900">🪄 AIの提案（{staffName} さん）— 反映する項目を選んでください</p>
        <button type="button" onClick={onClose} className="text-[11px] text-gray-700 underline underline-offset-2">閉じる</button>
      </div>
      <p className="text-[10px] text-violet-900 leading-relaxed">
        各項目に根拠（資料のどこから読んだか）を付けています。<strong>登録欄が空の項目は最初からチェック済み</strong>で、「まとめて反映」1つで登録できます。
        <strong>今の登録値と食い違う提案</strong>は下に分けて並べ、既定は「反映しない」（既存値と見比べて個別に選びます）。本籍・健康状態・宗教・家族の詳細などは資料にあっても取り出していません。
      </p>
      {proposal.notes.map((n, i) => (
        <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5">{n}</p>
      ))}
      {!hasAny && <p className="text-[11px] text-gray-600">読み取れた項目はありませんでした。</p>}

      {CONTACT_PROPOSAL_KEYS.some((k) => proposal.contact[k] && currentContactValue(current.contact, k) && currentContactValue(current.contact, k) !== proposal.contact[k]!.value) && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5" data-conflict-note>
          ⚠️ 今の登録値と食い違う提案: {CONTACT_PROPOSAL_KEYS.filter((k) => proposal.contact[k] && currentContactValue(current.contact, k) && currentContactValue(current.contact, k) !== proposal.contact[k]!.value).map((k) => CONTACT_FIELD_LABEL[k]).join("・")}（既定は反映しない。表で見比べて選んでください）
        </p>
      )}
      {CONTACT_PROPOSAL_KEYS.some((k) => proposal.contact[k]) && (
        <table className="w-full text-[11px] bg-white rounded-md border border-gray-200">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="text-left p-1">反映</th>
              <th className="text-left p-1">項目</th>
              <th className="text-left p-1">今の登録値</th>
              <th className="text-left p-1">提案</th>
              <th className="text-left p-1">根拠</th>
            </tr>
          </thead>
          <tbody>
            {CONTACT_PROPOSAL_KEYS.filter((k) => proposal.contact[k]).map((k) => (
              <tr key={k} className={`border-b border-gray-50 align-top ${currentContactValue(current.contact, k) && currentContactValue(current.contact, k) !== proposal.contact[k]!.value ? "bg-amber-50/60" : ""}`} data-conflict={currentContactValue(current.contact, k) && currentContactValue(current.contact, k) !== proposal.contact[k]!.value ? "1" : "0"}>
                <td className="p-1">
                  <input type="checkbox" checked={pick.contact[k]} onChange={(e) => setPick((p) => ({ ...p, contact: { ...p.contact, [k]: e.target.checked } }))} aria-label={`${CONTACT_FIELD_LABEL[k]} を反映`} />
                </td>
                <td className="p-1 whitespace-nowrap">{CONTACT_FIELD_LABEL[k]}</td>
                <td className="p-1 text-gray-600">{currentContactValue(current.contact, k) || "（空）"}</td>
                <td className="p-1 text-gray-900">{proposal.contact[k]!.value}</td>
                <td className="p-1 text-gray-500">{proposal.contact[k]!.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {proposal.emergency.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-1.5 space-y-1">
          <p className="text-[11px] text-gray-700">🚨 緊急連絡先（氏名・続柄・電話のみ。今の登録: {current.contact.emergency.length}件）</p>
          {proposal.emergency.map((e, i) => (
            <label key={i} className="flex items-start gap-2 text-[11px] text-gray-900">
              <input type="checkbox" checked={pick.emergency[i]} onChange={(ev) => setPick((p) => ({ ...p, emergency: p.emergency.map((v, j) => (j === i ? ev.target.checked : v)) }))} />
              <span>
                {e.name}（{e.relation}）{e.phone}
                <span className="block text-gray-500">根拠: {e.evidence}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {proposal.family.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-1.5 space-y-1">
          <p className="text-[11px] text-gray-700">👪 家族構成（続柄・人数のみ。今の登録: {current.contact.family.length}件）</p>
          {proposal.family.map((f, i) => (
            <label key={i} className="flex items-start gap-2 text-[11px] text-gray-900">
              <input type="checkbox" checked={pick.family[i]} onChange={(ev) => setPick((p) => ({ ...p, family: p.family.map((v, j) => (j === i ? ev.target.checked : v)) }))} />
              <span>
                {f.relation} {f.count ? `${f.count}人` : ""}
                <span className="block text-gray-500">根拠: {f.evidence}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {HIRING_PROFILE_FIELDS.some((f) => proposal.profile[f.key]) && (
        <div className="bg-white rounded-md border border-gray-200 p-1.5 space-y-2">
          <p className="text-[11px] text-gray-700">📜 経歴・入職時の想い</p>
          {HIRING_PROFILE_FIELDS.filter((f) => proposal.profile[f.key]).map((f) => {
            const p = proposal.profile[f.key]!;
            const cur = current.profile[f.key];
            return (
              <div key={f.key} className="text-[11px] space-y-1 border-b border-gray-50 pb-1.5">
                <label className="flex items-center gap-2 text-gray-900">
                  <input type="checkbox" checked={pick.profile[f.key].on} onChange={(e) => setPick((pk) => ({ ...pk, profile: { ...pk.profile, [f.key]: { ...pk.profile[f.key], on: e.target.checked } } }))} />
                  {f.group}: {f.label}
                </label>
                {cur.trim() && (
                  <div className="flex gap-3 pl-5 text-gray-700">
                    <span>今の登録値あり →</span>
                    {(["append", "replace"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-1">
                        <input type="radio" name={`mode-${f.key}`} checked={pick.profile[f.key].mode === m} onChange={() => setPick((pk) => ({ ...pk, profile: { ...pk.profile, [f.key]: { ...pk.profile[f.key], mode: m } } }))} />
                        {m === "append" ? "追記" : "置換"}
                      </label>
                    ))}
                  </div>
                )}
                <p className="pl-5 text-gray-900 whitespace-pre-wrap">{p.value}</p>
                <p className="pl-5 text-gray-500">根拠: {p.evidence}</p>
              </div>
            );
          })}
        </div>
      )}

      {proposal.testDate && (
        <p className="text-[11px] text-gray-700">
          受検日: {proposal.testDate.value}（根拠: {proposal.testDate.evidence}）— 資料の日付として登録内容を確認してください
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => void apply()} disabled={busy || !hasAny} className="px-4 py-2 bg-violet-700 text-white rounded-full text-sm hover:bg-violet-800 disabled:opacity-40 min-h-[44px]" data-bulk-apply>
          ✅ まとめて反映（チェック済みの項目を登録）
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 min-h-[44px]">
          反映しない
        </button>
      </div>
    </div>
  );
}

function currentContactValue(c: StaffContact, k: ContactProposalKey): string {
  return c[k] ?? "";
}

const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";
