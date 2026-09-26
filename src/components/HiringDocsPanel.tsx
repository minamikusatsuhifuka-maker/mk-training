"use client";

// 採用資料・経歴・入職時の想い（指示書184）— 育成カルテの個人画面の中・**院長のみ**描画される
// - 資料の登録（PDF・JPEG・PNG。iPhoneのHEICは端末側でJPEGに変換）／一覧／1タップで開く（10分の署名URLをその都度発行）／削除（確認あり）
// - 🪄 AIで内容を整理: 提案（根拠つき）を現在の登録値と並べ、項目ごとに「反映する」を選んで保存。既存値は既定で上書きしない
//   有料枠の設定（179）がOFFのときはボタンを無効表示
// - 経歴・入職時の想い: 院長が直接編集できる

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTACT_FIELD_LABEL,
  CONTACT_PROPOSAL_KEYS,
  HIRING_DOC_KINDS,
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
  const [kind, setKind] = useState<HiringDocKind>("resume");
  const [docDate, setDocDate] = useState("");
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
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

  // ─── 登録 ───
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let blob: Blob = file;
      let name = file.name;
      // 画像はJPEGに変換（HEIC・大きな写真対策）。PDFはそのまま
      if (file.type !== "application/pdf" && file.type !== "image/png") {
        blob = await resizeImageToJpeg(file, PHOTO_MAX_EDGE * 2, 0.9);
        name = name.replace(/\.[^.]+$/, "") + ".jpg";
      }
      const form = new FormData();
      form.set("userId", userId);
      form.set("kind", kind);
      form.set("docDate", docDate);
      form.set("memo", memo);
      form.set("file", blob, name);
      const { doc } = await api<{ doc: HiringDoc }>("/api/admin/hiring", { method: "POST", body: form });
      setData((d) => (d ? { ...d, docs: [doc, ...d.docs] } : d));
      setFile(null);
      setMemo("");
      setDocDate("");
      if (fileRef.current) fileRef.current.value = "";
      flash("📁 資料を登録しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const open = async (doc: HiringDoc) => {
    setError("");
    try {
      const j = await api<{ url: string; mimeType: string; fileName: string }>(`/api/admin/hiring/file?id=${encodeURIComponent(doc.id)}`);
      setViewer(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "開けませんでした");
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

      {/* 登録 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-2">
        <p className="text-[11px] font-medium text-gray-800">＋ 資料を登録（PDF・JPEG・PNG・20MBまで。iPhoneの写真も可）</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as HiringDocKind)} className={inputClass} aria-label="資料の種類">
            {HIRING_DOC_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inputClass} aria-label="資料の日付" />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ（任意）" className={inputClass} aria-label="メモ" />
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" aria-label="資料ファイル" />
        <button type="button" onClick={() => void upload()} disabled={busy || !file} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]">
          {busy ? "登録中…" : "📁 登録"}
        </button>
      </div>

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
          {viewer.mimeType === "application/pdf" ? (
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
          onApplied={async (applied) => {
            setExtract(null);
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
  onApplied: (applied: string[]) => Promise<void>;
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
      const j = await api<{ applied: string[] }>("/api/admin/hiring/apply", { method: "POST", body: JSON.stringify(input) });
      await onApplied(j.applied);
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
        各項目に根拠（資料のどこから読んだか）を付けています。今の登録値がある項目は既定で「反映しない」です。本籍・健康状態・宗教・家族の詳細などは資料にあっても取り出していません。
      </p>
      {proposal.notes.map((n, i) => (
        <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5">{n}</p>
      ))}
      {!hasAny && <p className="text-[11px] text-gray-600">読み取れた項目はありませんでした。</p>}

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
              <tr key={k} className="border-b border-gray-50 align-top">
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
        <button type="button" onClick={() => void apply()} disabled={busy || !hasAny} className="px-4 py-2 bg-violet-700 text-white rounded-full text-sm hover:bg-violet-800 disabled:opacity-40 min-h-[44px]">
          ✅ 選んだ項目を反映
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
