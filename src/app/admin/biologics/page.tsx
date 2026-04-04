"use client";

import { useState, useEffect, useRef } from "react";
import {
  biologicDrugs as initialData,
  biologicsLastUpdated,
  biologicsNextUpdate,
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

export default function AdminBiologicsPage() {
  const [data, setData] = useState<BiologicDrug[]>(initialData);
  const [editItem, setEditItem] = useState<BiologicDrug | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    getContent<BiologicDrug>(CONTENT_KEYS.biologics, initialData)
      .then((result) => {
        setData(result);
        setConnected(true);
      })
      .catch(() => {})
      .finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: BiologicDrug[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.biologics, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.genericName.toLowerCase().includes(q) ||
      d.target.toLowerCase().includes(q) ||
      d.diseases.some((dis) => dis.toLowerCase().includes(q))
    );
  });

  const openNew = () => { setEditItem(emptyDrug()); setDialogOpen(true); };
  const openEdit = (d: BiologicDrug) => { setEditItem(JSON.parse(JSON.stringify(d))); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: BiologicDrug[];
    if (idx >= 0) {
      newData = [...data];
      newData[idx] = editItem;
    } else {
      newData = [...data, editItem];
    }
    setData(newData);
    persistData(newData);
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const newData = data.filter((d) => d.id !== deleteId);
    setData(newData);
    persistData(newData);
    setDeleteId(null);
  };

  /* AI検索更新 */
  const handleAiUpdate = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const drugNames = data.map((d) => d.name).join("・");
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "biologics-update",
          keywords: [drugNames],
          mode: "quality",
          customPrompt: `以下の皮膚科生物学的製剤について、日本の最新の添付文書・厚労省通知に基づく投与スケジュールとレセプト摘要欄記載事項を確認し、変更があれば教えてください: ${drugNames}\n\n各製剤について:\n1. 投与スケジュールの変更点\n2. レセプト摘要欄記載事項の変更点\n3. 新しい適応症の追加\n4. その他の重要な変更\n\n変更がない場合は「変更なし」と記載してください。`,
        }),
      });
      if (!res.ok) {
        setAiResult("APIエラーが発生しました。後ほど再試行してください。");
      } else {
        const body = await res.json();
        const text = body.results?.[0]?.data
          ? JSON.stringify(body.results[0].data, null, 2)
          : body.results?.[0]?.error ?? "結果を取得できませんでした";
        setAiResult(text);
      }
    } catch {
      setAiResult("ネットワークエラーが発生しました。");
    } finally {
      setAiLoading(false);
      setAiDialogOpen(true);
    }
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

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">生物学的製剤管理（{data.length}件）</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAiUpdate} disabled={aiLoading}>
            {aiLoading ? "確認中..." : "🔄 AI検索更新"}
          </Button>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      {/* メタ情報 */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>最終更新: {biologicsLastUpdated}</span>
        <span>次回更新予定: {biologicsNextUpdate}</span>
      </div>

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
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[100px]">操作</th>
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
                    {d.schedule.selfInjection ? (
                      <span className="text-green-600 text-xs">○</span>
                    ) : (
                      <span className="text-red-500 text-xs">×</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b align-top w-[100px]">
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(d)}>編集</Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteId(d.id)}>削除</Button>
                    </div>
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
                <input
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                  value={editItem.diseases.join("、")}
                  onChange={(e) => setEditItem({ ...editItem, diseases: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) })}
                />
              </label>

              {/* 剤形・規格 */}
              <div className="space-y-1">
                <span className="text-xs font-medium">剤形・規格</span>
                {editItem.dosage.map((dos, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                      placeholder="剤形"
                      value={dos.form}
                      onChange={(e) => {
                        const next = [...editItem.dosage];
                        next[i] = { ...next[i], form: e.target.value };
                        setEditItem({ ...editItem, dosage: next });
                      }}
                    />
                    <input
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                      placeholder="規格"
                      value={dos.strength}
                      onChange={(e) => {
                        const next = [...editItem.dosage];
                        next[i] = { ...next[i], strength: e.target.value };
                        setEditItem({ ...editItem, dosage: next });
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={() => {
                      const next = editItem.dosage.filter((_, idx) => idx !== i);
                      setEditItem({ ...editItem, dosage: next.length > 0 ? next : [{ form: "", strength: "" }] });
                    }}>×</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditItem({ ...editItem, dosage: [...editItem.dosage, { form: "", strength: "" }] })}>
                  剤形を追加
                </Button>
              </div>

              {/* 投与スケジュール */}
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

              {/* レセプト記載事項 */}
              <div className="space-y-2">
                <span className="text-xs font-medium">レセプト摘要欄記載事項</span>
                {editItem.receiptNotes.map((note, ni) => (
                  <div key={ni} className="border rounded-md p-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">疾患 {ni + 1}</Badge>
                      <Button variant="outline" size="sm" onClick={() => {
                        const next = editItem.receiptNotes.filter((_, idx) => idx !== ni);
                        setEditItem({ ...editItem, receiptNotes: next.length > 0 ? next : [{ disease: "", required: [], timing: "" }] });
                      }}>×</Button>
                    </div>
                    <input
                      className="w-full rounded-md border px-3 py-1.5 text-sm"
                      placeholder="疾患名"
                      value={note.disease}
                      onChange={(e) => {
                        const next = [...editItem.receiptNotes];
                        next[ni] = { ...next[ni], disease: e.target.value };
                        setEditItem({ ...editItem, receiptNotes: next });
                      }}
                    />
                    <Textarea
                      rows={4}
                      placeholder="記載必須項目（1行1項目）"
                      value={note.required.join("\n")}
                      onChange={(e) => {
                        const next = [...editItem.receiptNotes];
                        next[ni] = { ...next[ni], required: e.target.value.split("\n").filter(Boolean) };
                        setEditItem({ ...editItem, receiptNotes: next });
                      }}
                    />
                    <input
                      className="w-full rounded-md border px-3 py-1.5 text-sm"
                      placeholder="記載タイミング"
                      value={note.timing}
                      onChange={(e) => {
                        const next = [...editItem.receiptNotes];
                        next[ni] = { ...next[ni], timing: e.target.value };
                        setEditItem({ ...editItem, receiptNotes: next });
                      }}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditItem({ ...editItem, receiptNotes: [...editItem.receiptNotes, { disease: "", required: [], timing: "" }] })}>
                  レセプト記載疾患を追加
                </Button>
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

      {/* AI結果ダイアログ */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI検索更新結果</DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-slate-50 p-4">
            <pre className="text-xs whitespace-pre-wrap break-words">{aiResult ?? "結果なし"}</pre>
          </div>
          <p className="text-xs text-muted-foreground">
            ※ 上記は参考情報です。内容を確認の上、必要に応じて手動で編集してください。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
