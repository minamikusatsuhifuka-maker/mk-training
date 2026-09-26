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
  FAMILY_RELATION_CHOICES,
  hiringDocKindLabel,
  isValidEmail,
  isValidPhone,
  joinCareerYm,
  splitCareerYm,
  ymd,
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

// ─── 提案の確認（3-1 ③④・187-補: その場で修正・行き先の変更・行の追加/削除）───
//   修正中の内容は React の状態だけに置く（sessionStorage / localStorage には書かない＝資料の個人情報を端末に残さない）

type Dest = ContactProposalKey | "emergency" | "family" | keyof HiringProfileText;
// 行き先の選択肢＝184 3-2 の登録先だけ。3-3の項目（本籍・健康状態・宗教・家族の詳細など）はここに存在しない
const DEST_OPTIONS: { value: Dest; label: string; group: string }[] = [
  ...CONTACT_PROPOSAL_KEYS.map((k) => ({ value: k as Dest, label: CONTACT_FIELD_LABEL[k], group: "連絡先" })),
  { value: "emergency", label: "緊急連絡先", group: "連絡先" },
  { value: "family", label: "家族構成", group: "連絡先" },
  ...HIRING_PROFILE_FIELDS.map((f) => ({ value: f.key as Dest, label: f.label, group: f.group })),
];
const destLabel = (d: Dest) => DEST_OPTIONS.find((o) => o.value === d)?.label ?? d;
const isContactDest = (d: Dest): d is ContactProposalKey => (CONTACT_PROPOSAL_KEYS as readonly string[]).includes(d);
const isProfileDest = (d: Dest): d is keyof HiringProfileText => HIRING_PROFILE_FIELDS.some((f) => f.key === d);
const isCareerDest = (d: Dest) => d === "education" || d === "career" || d === "licenses";

type Row = {
  id: string;
  dest: Dest;
  on: boolean;
  mode: "replace" | "append";
  /** 文字・日付・電話・メール・志望動機/自己PR・経歴の内容 */
  value: string;
  /** 経歴の年月（YYYY-MM） */
  ym: string;
  /** 緊急連絡先（氏名・続柄・電話）／家族構成（続柄・人数） */
  name: string;
  relation: string;
  phone: string;
  count: string;
  evidence: string;
  /** 院長が「＋ 行を追加」で足した行 */
  manual: boolean;
  /** 修正判定用（最初の内容） */
  orig: string;
};

const rowText = (r: Row): string =>
  r.dest === "emergency" ? `${r.name}|${r.relation}|${r.phone}` : r.dest === "family" ? `${r.relation}|${r.count}` : isCareerDest(r.dest) ? joinCareerYm(r.ym, r.value) : r.value.trim();
const rowEdited = (r: Row): boolean => r.manual || rowText(r) !== r.orig;
const finalValue = (r: Row): string => (isCareerDest(r.dest) ? joinCareerYm(r.ym, r.value) : r.value.trim());

/** 行ごとの形式チェック。理由を返す（空なら合格）。他の行の反映は止めない */
function rowError(r: Row): string {
  if (r.dest === "emergency") {
    if (!r.name.trim() && !r.phone.trim()) return "氏名か電話番号を入力してください";
    if (r.phone.trim() && !isValidPhone(r.phone)) return "電話番号の形式が合いません（数字10〜11桁）";
    return "";
  }
  if (r.dest === "family") {
    if (!r.relation.trim()) return "続柄を選んでください";
    if (r.count.trim() && !/^\d{1,2}$/.test(r.count.trim())) return "人数は数字（2桁まで）で入力してください";
    return "";
  }
  const v = finalValue(r);
  if (!v) return "内容が空です";
  if (r.dest === "birthday" && !ymd(v)) return "生年月日は日付（YYYY-MM-DD）で入力してください";
  if ((r.dest === "phoneMobile" || r.dest === "phoneHome") && !isValidPhone(v)) return "電話番号の形式が合いません（数字10〜11桁）";
  if (r.dest === "privateEmail" && !isValidEmail(v)) return "メールアドレスの形式が合いません";
  return "";
}

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}`;

function blankRow(dest: Dest, on: boolean, evidence: string, manual: boolean): Row {
  return { id: newRowId(), dest, on, mode: "append", value: "", ym: "", name: "", relation: "", phone: "", count: "", evidence, manual, orig: "" };
}

function rowsFromProposal(proposal: HiringProposal, current: { contact: StaffContact; profile: HiringProfile }): Row[] {
  const rows: Row[] = [];
  for (const k of CONTACT_PROPOSAL_KEYS) {
    const p = proposal.contact[k];
    if (!p) continue;
    const r = blankRow(k, !currentContactValue(current.contact, k), p.evidence, false);
    r.value = p.value;
    r.orig = rowText(r);
    rows.push(r);
  }
  for (const e of proposal.emergency) {
    const r = blankRow("emergency", current.contact.emergency.length === 0, e.evidence, false);
    r.name = e.name; r.relation = e.relation; r.phone = e.phone;
    r.orig = rowText(r);
    rows.push(r);
  }
  for (const f of proposal.family) {
    const r = blankRow("family", current.contact.family.length === 0, f.evidence, false);
    r.relation = f.relation; r.count = f.count;
    r.orig = rowText(r);
    rows.push(r);
  }
  for (const f of HIRING_PROFILE_FIELDS) {
    const p = proposal.profile[f.key];
    if (!p) continue;
    const r = blankRow(f.key, !current.profile[f.key].trim(), p.evidence, false);
    if (isCareerDest(f.key)) {
      const { ym, rest } = splitCareerYm(p.value);
      r.ym = ym; r.value = rest;
    } else {
      r.value = p.value;
    }
    r.orig = rowText(r);
    rows.push(r);
  }
  return rows;
}

/** 行き先を変える。形が違う行き先へ移すときは、読み取った文字を先頭の欄に引き継ぐ（根拠はそのまま） */
function retarget(r: Row, dest: Dest, current: { contact: StaffContact; profile: HiringProfile }): Row {
  const text = rowText(r).replace(/\|/g, " ").trim();
  const next: Row = { ...r, dest };
  const wasStructured = r.dest === "emergency" || r.dest === "family";
  if (dest === "emergency") {
    if (r.dest !== "emergency") { next.name = r.dest === "family" ? "" : text; next.relation = r.dest === "family" ? r.relation : ""; next.phone = ""; }
    next.on = current.contact.emergency.length === 0;
  } else if (dest === "family") {
    if (r.dest !== "family") { next.relation = r.dest === "emergency" ? r.relation : ""; next.count = ""; }
    next.on = current.contact.family.length === 0;
  } else {
    if (wasStructured) { next.value = text; next.ym = ""; }
    else if (isCareerDest(dest) && !isCareerDest(r.dest)) { const s = splitCareerYm(r.value); next.ym = s.ym; next.value = s.rest; }
    else if (!isCareerDest(dest) && isCareerDest(r.dest)) { next.value = joinCareerYm(r.ym, r.value); next.ym = ""; }
    next.on = isContactDest(dest) ? !currentContactValue(current.contact, dest) : !current.profile[dest].trim();
  }
  return next;
}

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
  const [rows, setRows] = useState<Row[]>(() => rowsFromProposal(proposal, current));
  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const dirty = rows.some(rowEdited);

  // 3: 修正中にページを離れようとしたら確認（ブラウザ離脱＋アプリ内リンク）。保存領域には書かない
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!confirm("AIの提案を修正中です。このページを離れると修正中の内容は消えます。離れますか？")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);

  const conflictOf = (r: Row): string => {
    if (!isContactDest(r.dest)) return "";
    const cur = currentContactValue(current.contact, r.dest);
    return cur && cur !== finalValue(r) ? cur : "";
  };
  const conflictLabels = Array.from(new Set(rows.filter((r) => conflictOf(r)).map((r) => destLabel(r.dest))));

  const apply = async () => {
    const input: HiringApplyInput = { userId };
    const contact: NonNullable<HiringApplyInput["contact"]> = {};
    const emergency: NonNullable<HiringApplyInput["emergency"]> = [];
    const family: NonNullable<HiringApplyInput["family"]> = [];
    const profile: NonNullable<HiringApplyInput["profile"]> = {};
    for (const r of rows) {
      if (!r.on || rowError(r)) continue; // 形式に合わない行はその行だけ止める
      if (r.dest === "emergency") emergency.push({ name: r.name.trim(), relation: r.relation.trim(), phone: r.phone.trim() });
      else if (r.dest === "family") family.push({ relation: r.relation.trim(), count: r.count.trim() });
      else if (isContactDest(r.dest)) contact[r.dest] = finalValue(r);
      else if (isProfileDest(r.dest)) profile[r.dest] = { value: finalValue(r), mode: r.mode };
    }
    if (Object.keys(contact).length > 0) input.contact = contact;
    if (emergency.length > 0) input.emergency = emergency;
    if (family.length > 0) input.family = family;
    if (Object.keys(profile).length > 0) input.profile = profile;
    if (!input.contact && !input.emergency && !input.family && !input.profile) {
      onError("反映する項目が選ばれていません（形式に合わない行は反映されません）");
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

  const hasAny = rows.length > 0 || !!proposal.testDate;
  const relationChoices = (r: Row) => (r.relation && !(FAMILY_RELATION_CHOICES as readonly string[]).includes(r.relation) ? [r.relation, ...FAMILY_RELATION_CHOICES] : [...FAMILY_RELATION_CHOICES]);
  const small = "w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] min-h-[36px] bg-white";

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/50 p-2 space-y-2" data-hiring-proposal data-dirty={dirty ? "1" : "0"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-violet-900">🪄 AIの提案（{staffName} さん）— 内容を確かめ、必要なら直してから反映してください</p>
        <button type="button" onClick={onClose} className="text-[11px] text-gray-700 underline underline-offset-2">閉じる</button>
      </div>
      <p className="text-[10px] text-violet-900 leading-relaxed">
        各行は<strong>その場で修正</strong>でき（✏️ 修正済みの印が付き、根拠はそのまま残ります）、<strong>行き先</strong>も選び直せます。<strong>登録欄が空の項目は最初からチェック済み</strong>で、「まとめて反映」1つで修正後の値を登録します。
        <strong>今の登録値と食い違う行</strong>は既存値と並べ、既定は「反映しない」。形式に合わない行はその行に理由が出て、他の行だけ反映されます。本籍・健康状態・宗教・家族の詳細などは取り出さず、行き先にも選べません。
      </p>
      {proposal.notes.map((n, i) => (
        <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5">{n}</p>
      ))}
      {!hasAny && <p className="text-[11px] text-gray-600">読み取れた項目はありませんでした。「＋ 行を追加」で手入力できます。</p>}
      {conflictLabels.length > 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5" data-conflict-note>
          ⚠️ 今の登録値と食い違う提案: {conflictLabels.join("・")}（既定は反映しない。既存値と見比べて選んでください）
        </p>
      )}

      <ul className="space-y-1.5" data-proposal-rows>
        {rows.map((r) => {
          const err = rowError(r);
          const conflict = conflictOf(r);
          const edited = rowEdited(r);
          const label = destLabel(r.dest);
          const curProfile = isProfileDest(r.dest) ? current.profile[r.dest] : "";
          return (
            <li key={r.id} className={`rounded-md border p-1.5 space-y-1 text-[11px] ${conflict ? "bg-amber-50/60 border-amber-200" : "bg-white border-gray-200"}`} data-proposal-row data-dest={r.dest} data-conflict={conflict ? "1" : "0"} data-edited={edited ? "1" : "0"} data-error={err ? "1" : "0"}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-gray-900">
                  <input type="checkbox" checked={r.on} onChange={(e) => setRow(r.id, { on: e.target.checked })} aria-label={`${label} を反映`} />
                  反映
                </label>
                <select value={r.dest} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? retarget(x, e.target.value as Dest, current) : x)))} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] min-h-[32px] bg-white" aria-label="行き先">
                  {DEST_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.group}: {o.label}
                    </option>
                  ))}
                </select>
                {edited && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-900" data-edited-mark>✏️ {r.manual ? "手入力" : "修正済み"}</span>}
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="ml-auto text-[11px] text-gray-600 underline underline-offset-2 min-h-[32px]" aria-label={`${label} の行を削除`}>
                  🗑 行を削除
                </button>
              </div>
              {r.dest === "emergency" ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder="氏名" className={small} aria-label="緊急連絡先の氏名" />
                  <input value={r.relation} onChange={(e) => setRow(r.id, { relation: e.target.value })} placeholder="続柄" className={small} aria-label="緊急連絡先の続柄" />
                  <input type="tel" value={r.phone} onChange={(e) => setRow(r.id, { phone: e.target.value })} placeholder="電話番号" className={small} aria-label="緊急連絡先の電話番号" />
                </div>
              ) : r.dest === "family" ? (
                <div className="grid grid-cols-[1fr_6em] gap-1.5">
                  <select value={r.relation} onChange={(e) => setRow(r.id, { relation: e.target.value })} className={small} aria-label="家族構成の続柄">
                    <option value="">続柄を選ぶ</option>
                    {relationChoices(r).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input type="number" min={0} max={99} inputMode="numeric" value={r.count} onChange={(e) => setRow(r.id, { count: e.target.value })} placeholder="人数" className={small} aria-label="家族構成の人数" />
                </div>
              ) : isCareerDest(r.dest) ? (
                <div className="grid grid-cols-[9em_1fr] gap-1.5">
                  <input type="month" value={r.ym} onChange={(e) => setRow(r.id, { ym: e.target.value })} className={small} aria-label={`${label} の年月`} />
                  <input value={r.value} onChange={(e) => setRow(r.id, { value: e.target.value })} placeholder="内容" className={small} aria-label={`${label} の内容`} />
                </div>
              ) : r.dest === "motivation" || r.dest === "selfPr" ? (
                <textarea value={r.value} onChange={(e) => setRow(r.id, { value: e.target.value })} rows={3} className={`${small} min-h-[64px]`} aria-label={`${label} の内容`} />
              ) : (
                <input
                  type={r.dest === "birthday" ? "date" : r.dest === "privateEmail" ? "email" : r.dest === "phoneMobile" || r.dest === "phoneHome" ? "tel" : "text"}
                  value={r.value}
                  onChange={(e) => setRow(r.id, { value: e.target.value })}
                  className={small}
                  aria-label={`${label} の提案値`}
                />
              )}
              {err && <p className="text-red-700" data-row-error>⚠ {err}</p>}
              {conflict && <p className="text-amber-900">今の登録値: {conflict} → 提案: {finalValue(r)}</p>}
              {curProfile.trim() && (
                <div className="flex gap-3 text-gray-700">
                  <span>今の登録値あり →</span>
                  {(["append", "replace"] as const).map((m) => (
                    <label key={m} className="flex items-center gap-1">
                      <input type="radio" name={`mode-${r.id}`} checked={r.mode === m} onChange={() => setRow(r.id, { mode: m })} />
                      {m === "append" ? "追記" : "置換"}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-gray-500" data-row-evidence>根拠: {r.evidence || "（なし）"}</p>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => setRows((rs) => [...rs, blankRow("career", true, "院長の手入力", true)])} className="px-3 py-1.5 border border-violet-300 text-violet-900 rounded-full text-[11px] hover:bg-white min-h-[36px]" data-add-row>
        ＋ 行を追加（AIが読み取れなかった項目）
      </button>

      {proposal.testDate && (
        <p className="text-[11px] text-gray-700">
          受検日: {proposal.testDate.value}（根拠: {proposal.testDate.evidence}）— 資料の日付として登録内容を確認してください
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => void apply()} disabled={busy || rows.length === 0} className="px-4 py-2 bg-violet-700 text-white rounded-full text-sm hover:bg-violet-800 disabled:opacity-40 min-h-[44px]" data-bulk-apply>
          ✅ まとめて反映（チェック済みの項目を修正後の値で登録）
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
