"use client";

import { useState, useEffect, useRef } from "react";
import {
  biologicDrugs as initialData,
  type BiologicDrug,
} from "@/data/biologics";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { AdminBanner } from "@/components/AdminBanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/* 型定義 */
type GeminiChange = { field: string; old: string; new: string; reason: string };
type GeminiDrugResult = {
  id: string;
  name: string;
  hasChanges: boolean;
  changes: GeminiChange[];
  verifiedSchedule?: {
    induction: string;
    maintenance: string;
    selfInjection: boolean;
    note?: string;
  };
  lastConfirmed: string;
};
type GeminiVerifyResult = {
  results: GeminiDrugResult[];
  summary: string;
  updatedAt: string;
};
type BiologicsMeta = { lastUpdated: string; nextUpdate: string };
type LogEntry = { date: string; type: "gemini" | "manual"; message: string };

function emptyDrug(): BiologicDrug {
  return {
    id: `new_${Date.now()}`,
    name: "",
    genericName: "",
    target: "",
    diseases: [],
    dosage: [{ form: "", strength: "" }],
    schedule: { induction: "", maintenance: "", selfInjection: false },
    receiptNotes: [{ disease: "", required: [], timing: "" }],
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AdminBiologicsPage() {
  const [data, setData] = useState<BiologicDrug[]>(initialData);
  const [editItem, setEditItem] = useState<BiologicDrug | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /* Gemini全体確認 */
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState<GeminiVerifyResult | null>(null);
  const [geminiDialogOpen, setGeminiDialogOpen] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [verifyProgress, setVerifyProgress] = useState({ current: 0, total: 0, drugName: "" });

  /* 個別製剤確認 */
  const [singleLoading, setSingleLoading] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<Record<string, { changes: string[]; raw: unknown }>>({});

  /* メタ情報 */
  const [meta, setMeta] = useState<BiologicsMeta>({ lastUpdated: "2025-04-01", nextUpdate: "2025-06-01" });

  /* 変更履歴 */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const loaded = useRef(false);

  useEffect(() => {
    getContent<BiologicDrug>(CONTENT_KEYS.biologics, initialData)
      .then((result) => { setData(result); setConnected(true); })
      .catch(() => {})
      .finally(() => { loaded.current = true; });
    // メタ情報読み込み
    getContent<BiologicsMeta>("biologics_meta" as string, [{ lastUpdated: "2025-04-01", nextUpdate: "2025-06-01" } as unknown as BiologicsMeta])
      .then((r) => { if (r.length > 0 && typeof r[0] === "object" && "lastUpdated" in (r[0] as object)) setMeta(r[0] as unknown as BiologicsMeta); })
      .catch(() => {});
    // ログ読み込み
    getContent<LogEntry>("biologics_log" as string, [])
      .then(setLogs)
      .catch(() => {});
  }, []);

  const persistData = async (items: BiologicDrug[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.biologics, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const persistMeta = async (m: BiologicsMeta) => {
    setMeta(m);
    await saveContent("biologics_meta" as string, [m] as unknown as BiologicsMeta[]);
  };

  const addLog = async (type: "gemini" | "manual", message: string) => {
    const entry: LogEntry = { date: today(), type, message };
    const updated = [entry, ...logs].slice(0, 50);
    setLogs(updated);
    await saveContent("biologics_log" as string, updated as unknown as LogEntry[]);
  };

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.genericName.toLowerCase().includes(q) || d.target.toLowerCase().includes(q) || d.diseases.some((dis) => dis.toLowerCase().includes(q));
  });

  const openNew = () => { setEditItem(emptyDrug()); setDialogOpen(true); };
  const openEdit = (d: BiologicDrug) => { setEditItem(JSON.parse(JSON.stringify(d))); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: BiologicDrug[];
    if (idx >= 0) { newData = [...data]; newData[idx] = editItem; } else { newData = [...data, editItem]; }
    setData(newData);
    persistData(newData);
    addLog("manual", `${editItem.name} を${idx >= 0 ? "編集" : "新規追加"}`);
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const drug = data.find((d) => d.id === deleteId);
    const newData = data.filter((d) => d.id !== deleteId);
    setData(newData);
    persistData(newData);
    if (drug) addLog("manual", `${drug.name} を削除`);
    setDeleteId(null);
  };

  /* ===== Gemini 全製剤確認（1製剤ずつループ） ===== */
  const handleGeminiVerifyAll = async () => {
    setGeminiLoading(true);
    setGeminiError(null);
    setGeminiResult(null);
    setVerifyProgress({ current: 0, total: data.length, drugName: "" });

    const results: GeminiDrugResult[] = [];
    let errorCount = 0;

    for (let i = 0; i < data.length; i++) {
      const drug = data[i];
      setVerifyProgress({ current: i, total: data.length, drugName: drug.name });

      try {
        const res = await fetch("/api/gemini-biologics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify_single", drugName: drug.name, currentData: drug }),
        });

        if (res.ok) {
          const raw = await res.json();
          const changes: GeminiChange[] = [];
          const schedule = raw.schedule as Record<string, unknown> | undefined;

          if (schedule) {
            if (schedule.induction && schedule.induction !== drug.schedule.induction)
              changes.push({ field: "導入投与", old: drug.schedule.induction, new: schedule.induction as string, reason: "添付文書に基づく確認" });
            if (schedule.maintenance && schedule.maintenance !== drug.schedule.maintenance)
              changes.push({ field: "維持投与", old: drug.schedule.maintenance, new: schedule.maintenance as string, reason: "添付文書に基づく確認" });
            if (typeof schedule.selfInjection === "boolean" && schedule.selfInjection !== drug.schedule.selfInjection)
              changes.push({ field: "自己注射", old: drug.schedule.selfInjection ? "可" : "不可", new: schedule.selfInjection ? "可" : "不可", reason: "添付文書に基づく確認" });
          }

          if (Array.isArray(raw.changes)) {
            for (const c of raw.changes as string[]) {
              changes.push({ field: "情報更新", old: "-", new: c, reason: "Gemini確認" });
            }
          }

          results.push({
            id: drug.id,
            name: drug.name,
            hasChanges: changes.length > 0,
            changes,
            verifiedSchedule: schedule ? {
              induction: (schedule.induction as string) || drug.schedule.induction,
              maintenance: (schedule.maintenance as string) || drug.schedule.maintenance,
              selfInjection: (schedule.selfInjection as boolean) ?? drug.schedule.selfInjection,
              note: (schedule.note as string) || drug.schedule.note,
            } : undefined,
            lastConfirmed: (raw.lastConfirmed as string) || today(),
          });
        } else {
          errorCount++;
          results.push({ id: drug.id, name: drug.name, hasChanges: false, changes: [], lastConfirmed: today() });
        }
      } catch {
        errorCount++;
        results.push({ id: drug.id, name: drug.name, hasChanges: false, changes: [], lastConfirmed: today() });
      }

      setVerifyProgress({ current: i + 1, total: data.length, drugName: drug.name });
    }

    const changedCount = results.filter((r) => r.hasChanges).length;
    const summary = `${data.length}製剤を確認完了。変更提案: ${changedCount}件${errorCount > 0 ? `、エラー: ${errorCount}件` : ""}`;

    setGeminiResult({ results, summary, updatedAt: today() });
    const ids = new Set(results.filter((r) => r.hasChanges).map((r) => r.id));
    setSelectedChanges(ids);
    setGeminiLoading(false);
    setGeminiDialogOpen(true);
  };

  /* Gemini結果を適用 */
  const applyGeminiChanges = async (applyIds: Set<string>) => {
    if (!geminiResult) return;
    let newData = [...data];
    const applied: string[] = [];

    for (const r of geminiResult.results) {
      if (!applyIds.has(r.id) || !r.hasChanges || !r.verifiedSchedule) continue;
      const idx = newData.findIndex((d) => d.id === r.id);
      if (idx < 0) continue;
      newData[idx] = {
        ...newData[idx],
        schedule: {
          induction: r.verifiedSchedule.induction || newData[idx].schedule.induction,
          maintenance: r.verifiedSchedule.maintenance || newData[idx].schedule.maintenance,
          selfInjection: r.verifiedSchedule.selfInjection ?? newData[idx].schedule.selfInjection,
          note: r.verifiedSchedule.note || newData[idx].schedule.note,
        },
        lastUpdated: today(),
      };
      applied.push(r.name);
    }

    setData(newData);
    await persistData(newData);
    await persistMeta({ ...meta, lastUpdated: today() });
    await addLog("gemini", `Gemini 2.5 Proで確認・適用: ${applied.join("、") || "変更なし"}`);
    setGeminiDialogOpen(false);
    setGeminiResult(null);
  };

  /* ===== 個別製剤確認 ===== */
  const handleSingleVerify = async (drug: BiologicDrug) => {
    setSingleLoading(drug.id);
    try {
      const res = await fetch("/api/gemini-biologics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_single", drugName: drug.name, currentData: drug }),
      });
      if (res.ok) {
        const result = await res.json();
        setSingleResult((prev) => ({
          ...prev,
          [drug.id]: { changes: result.changes || [], raw: result },
        }));
      }
    } catch { /* ignore */ }
    finally { setSingleLoading(null); }
  };

  const applySingleResult = async (drugId: string) => {
    const r = singleResult[drugId];
    if (!r?.raw) return;
    const raw = r.raw as Record<string, unknown>;
    const idx = data.findIndex((d) => d.id === drugId);
    if (idx < 0) return;
    const schedule = raw.schedule as Record<string, unknown> | undefined;
    const newData = [...data];
    if (schedule) {
      newData[idx] = {
        ...newData[idx],
        schedule: {
          induction: (schedule.induction as string) || newData[idx].schedule.induction,
          maintenance: (schedule.maintenance as string) || newData[idx].schedule.maintenance,
          selfInjection: (schedule.selfInjection as boolean) ?? newData[idx].schedule.selfInjection,
          note: (schedule.note as string) || newData[idx].schedule.note,
        },
        lastUpdated: today(),
      };
    }
    setData(newData);
    await persistData(newData);
    await addLog("gemini", `${newData[idx].name} をGeminiで個別確認・適用`);
    setSingleResult((prev) => { const n = { ...prev }; delete n[drugId]; return n; });
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={connected} />
      {saveMsg && (
        <div className={`rounded-md px-4 py-2 text-sm ${saveMsg.startsWith("保存しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {saveMsg}
        </div>
      )}
      {saving && <div className="text-sm text-muted-foreground animate-pulse">保存中...</div>}

      {/* Gemini確認中オーバーレイ */}
      {geminiLoading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent" />
              <div>
                <p className="font-bold text-lg">Gemini 2.5 Proが確認中</p>
                <p className="text-sm text-muted-foreground">
                  {verifyProgress.drugName ? `${verifyProgress.drugName}を確認中...` : "準備中..."} ({verifyProgress.current}/{verifyProgress.total})
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-teal-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${verifyProgress.total > 0 ? (verifyProgress.current / verifyProgress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2">
              {verifyProgress.current}/{verifyProgress.total}製剤完了
            </p>
            <p className="text-xs text-center text-muted-foreground mt-1">
              ※ 1製剤あたり約10〜20秒かかります
            </p>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">生物学的製剤管理（{data.length}件）</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            className="bg-teal text-white hover:bg-teal/90"
            onClick={handleGeminiVerifyAll}
            disabled={geminiLoading}
          >
            {geminiLoading
              ? (verifyProgress.total > 0 ? `確認中... (${verifyProgress.current}/${verifyProgress.total})` : "Gemini 2.5 Proが確認中...")
              : "🔍 Gemini 2.5 Proで全製剤を確認"}
          </Button>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      {/* メタ情報 */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <span className="text-muted-foreground">最終更新: <strong>{meta.lastUpdated}</strong></span>
        <span className="text-muted-foreground">次回更新予定: <strong>{meta.nextUpdate}</strong></span>
        <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => persistMeta({ ...meta, lastUpdated: today() })}>
          更新日を今日に設定
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => setShowLogs(!showLogs)}>
          {showLogs ? "ログを閉じる" : "変更履歴"}
        </Button>
      </div>

      {/* 変更履歴ログ */}
      {showLogs && logs.length > 0 && (
        <div className="border rounded-lg p-3 bg-slate-50 space-y-1 max-h-[200px] overflow-y-auto">
          <p className="text-xs font-semibold text-slate-600 mb-2">変更履歴（直近50件）</p>
          {logs.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">{l.date}</span>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${l.type === "gemini" ? "bg-teal-light text-teal" : "bg-slate-100 text-slate-600"}`}>
                {l.type === "gemini" ? "Gemini" : "手動"}
              </Badge>
              <span className="text-slate-700">{l.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 検索 */}
      <input
        type="text"
        placeholder="薬品名・一般名・標的分子・疾患で検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      {/* テーブル */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b">薬剤名</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b hidden sm:table-cell">標的分子</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b hidden md:table-cell">適応疾患</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-2 py-2 border-b">自己注</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[180px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-muted/50">
                  <td className="px-2 py-1.5 border-b align-top">
                    <div className="font-medium text-sm">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.genericName}</div>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top hidden sm:table-cell">
                    <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{d.target}</span>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top hidden md:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {d.diseases.map((dis) => (
                        <span key={dis} className="text-[10px] bg-teal-light text-teal px-1 py-0.5 rounded">{dis}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 border-b text-center">
                    {d.schedule.selfInjection ? <span className="text-green-600 text-xs">○</span> : <span className="text-red-500 text-xs">×</span>}
                  </td>
                  <td className="px-2 py-1.5 border-b align-top w-[180px]">
                    <div className="flex gap-1 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openEdit(d)}>編集</Button>
                      <Button variant="outline" size="sm" onClick={() => handleSingleVerify(d)} disabled={singleLoading === d.id}>
                        {singleLoading === d.id ? "..." : "🔍"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteId(d.id)}>削除</Button>
                    </div>
                    {/* 個別確認結果 */}
                    {singleResult[d.id] && (
                      <div className="mt-2 p-2 rounded border bg-blue-50 text-xs space-y-1">
                        {(singleResult[d.id].changes.length > 0) ? (
                          <>
                            <p className="font-medium text-blue-700">変更提案:</p>
                            {singleResult[d.id].changes.map((c, i) => <p key={i} className="text-blue-600">・{c}</p>)}
                            <div className="flex gap-1 mt-1">
                              <Button size="sm" className="h-5 text-[10px] bg-teal text-white" onClick={() => applySingleResult(d.id)}>適用</Button>
                              <Button size="sm" variant="outline" className="h-5 text-[10px]" onClick={() => setSingleResult((p) => { const n = { ...p }; delete n[d.id]; return n; })}>無視</Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-green-700">✅ 変更なし（最新の内容と一致）</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem && data.some((d) => d.id === editItem.id) ? "生物学的製剤を編集" : "新規追加"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-xs font-medium">薬剤名</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">一般名</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.genericName} onChange={(e) => setEditItem({ ...editItem, genericName: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">標的分子</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.target} onChange={(e) => setEditItem({ ...editItem, target: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">適応疾患（カンマ区切り）</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.diseases.join("、")} onChange={(e) => setEditItem({ ...editItem, diseases: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) })} />
              </label>
              <div className="space-y-1">
                <span className="text-xs font-medium">剤形・規格</span>
                {editItem.dosage.map((dos, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="剤形" value={dos.form} onChange={(e) => { const next = [...editItem.dosage]; next[i] = { ...next[i], form: e.target.value }; setEditItem({ ...editItem, dosage: next }); }} />
                    <input className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="規格" value={dos.strength} onChange={(e) => { const next = [...editItem.dosage]; next[i] = { ...next[i], strength: e.target.value }; setEditItem({ ...editItem, dosage: next }); }} />
                    <Button variant="outline" size="sm" onClick={() => { const next = editItem.dosage.filter((_, idx) => idx !== i); setEditItem({ ...editItem, dosage: next.length > 0 ? next : [{ form: "", strength: "" }] }); }}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditItem({ ...editItem, dosage: [...editItem.dosage, { form: "", strength: "" }] })}>剤形を追加</Button>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">導入投与</span>
                <Textarea rows={2} value={editItem.schedule.induction} onChange={(e) => setEditItem({ ...editItem, schedule: { ...editItem.schedule, induction: e.target.value } })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">維持投与</span>
                <Textarea rows={2} value={editItem.schedule.maintenance} onChange={(e) => setEditItem({ ...editItem, schedule: { ...editItem.schedule, maintenance: e.target.value } })} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editItem.schedule.selfInjection} onChange={(e) => setEditItem({ ...editItem, schedule: { ...editItem.schedule, selfInjection: e.target.checked } })} />
                <span className="text-xs font-medium">自己注射可</span>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">備考</span>
                <Textarea rows={2} value={editItem.schedule.note ?? ""} onChange={(e) => setEditItem({ ...editItem, schedule: { ...editItem.schedule, note: e.target.value || undefined } })} />
              </label>
              <div className="space-y-2">
                <span className="text-xs font-medium">レセプト摘要欄記載事項</span>
                {editItem.receiptNotes.map((note, ni) => (
                  <div key={ni} className="border rounded-md p-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">疾患 {ni + 1}</Badge>
                      <Button variant="outline" size="sm" onClick={() => { const next = editItem.receiptNotes.filter((_, idx) => idx !== ni); setEditItem({ ...editItem, receiptNotes: next.length > 0 ? next : [{ disease: "", required: [], timing: "" }] }); }}>×</Button>
                    </div>
                    <input className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="疾患名" value={note.disease} onChange={(e) => { const next = [...editItem.receiptNotes]; next[ni] = { ...next[ni], disease: e.target.value }; setEditItem({ ...editItem, receiptNotes: next }); }} />
                    <Textarea rows={4} placeholder="記載必須項目（1行1項目）" value={note.required.join("\n")} onChange={(e) => { const next = [...editItem.receiptNotes]; next[ni] = { ...next[ni], required: e.target.value.split("\n").filter(Boolean) }; setEditItem({ ...editItem, receiptNotes: next }); }} />
                    <input className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="記載タイミング" value={note.timing} onChange={(e) => { const next = [...editItem.receiptNotes]; next[ni] = { ...next[ni], timing: e.target.value }; setEditItem({ ...editItem, receiptNotes: next }); }} />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditItem({ ...editItem, receiptNotes: [...editItem.receiptNotes, { disease: "", required: [], timing: "" }] })}>レセプト記載疾患を追加</Button>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">最終更新日</span>
                <input type="date" className="rounded-md border px-3 py-1.5 text-sm" value={editItem.lastUpdated} onChange={(e) => setEditItem({ ...editItem, lastUpdated: e.target.value })} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>生物学的製剤を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Gemini全体確認ダイアログ ===== */}
      <Dialog open={geminiDialogOpen} onOpenChange={setGeminiDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🔍 Gemini 2.5 Pro 確認結果</DialogTitle>
          </DialogHeader>

          {geminiError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">{geminiError}</div>
          )}

          {geminiResult && (
            <div className="space-y-4">
              {/* サマリー */}
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium mb-1">確認結果サマリー</p>
                <p className="text-xs">{geminiResult.summary}</p>
              </div>

              {/* 各製剤の結果 */}
              <div className="space-y-3">
                {geminiResult.results.map((r) => (
                  <div key={r.id} className={`rounded-lg border p-3 ${r.hasChanges ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {r.hasChanges ? (
                        <>
                          <input
                            type="checkbox"
                            checked={selectedChanges.has(r.id)}
                            onChange={() => {
                              const next = new Set(selectedChanges);
                              if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                              setSelectedChanges(next);
                            }}
                          />
                          <Badge className="bg-red-100 text-red-700 text-[10px]">変更あり</Badge>
                        </>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 text-[10px]">✅ 変更なし</Badge>
                      )}
                      <span className="font-medium text-sm">{r.name}</span>
                    </div>

                    {r.hasChanges && r.changes.length > 0 && (
                      <div className="space-y-2 ml-5">
                        {r.changes.map((c, ci) => (
                          <div key={ci} className="text-xs rounded border border-red-100 bg-white p-2">
                            <p className="font-medium text-red-700">{c.field}</p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div>
                                <span className="text-[10px] text-muted-foreground">旧:</span>
                                <p className="text-red-600 line-through">{c.old}</p>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground">新:</span>
                                <p className="text-green-700">{c.new}</p>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">理由: {c.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setGeminiDialogOpen(false)}>閉じる</Button>
            {geminiResult && geminiResult.results.some((r) => r.hasChanges) && (
              <>
                <Button variant="outline" onClick={() => applyGeminiChanges(selectedChanges)} disabled={selectedChanges.size === 0}>
                  選択した{selectedChanges.size}件を適用
                </Button>
                <Button className="bg-teal text-white" onClick={() => applyGeminiChanges(new Set(geminiResult.results.filter((r) => r.hasChanges).map((r) => r.id)))}>
                  ✅ 全て適用
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supabase SQL案内 */}
      <div className="mt-6 rounded-md border border-dashed border-slate-300 p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-2">【Supabase SQL】初回のみ実行してください:</p>
        <pre className="bg-slate-50 rounded p-2 text-[11px] overflow-x-auto">
{`INSERT INTO content_store (id, content_type, data) VALUES
  ('biologics_data', 'biologics', '[]'::jsonb),
  ('biologics_meta', 'biologics', '{"lastUpdated": "${today()}", "nextUpdate": "2026-06-04"}'::jsonb),
  ('biologics_log', 'biologics', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;`}
        </pre>
      </div>
    </div>
  );
}
