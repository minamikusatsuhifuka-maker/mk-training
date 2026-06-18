"use client";

// 疾患ディープリサーチ モーダル（STEP 3 作業2）
//  単一/複数の疾患を順番にリサーチし、選択した保存先（学習資料・組織ナレッジ・マニュアル・疾患データ更新）へ反映する。
//  ※ 一括時は1件ずつ順次処理（Gemini レート制限対策で各件の間に短い待機）。
//  ※ 疾患データ更新は「更新案」を提示し、確認後に onApply で親へ反映する。
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MarkdownView } from "@/components/deep-research/MarkdownView";
import { RESEARCH_PERSPECTIVES, type ResearchPerspective } from "@/lib/deep-research/types";
import type { Disease } from "@/data/diseases";

type Target = "material" | "org_knowledge" | "manual" | "disease_update";

type DiseaseUpdate = {
  description?: string;
  cause?: string;
  treatment?: string;
  keyPoints?: string[];
};

type PerResult = {
  disease: Disease;
  research?: string;
  diseaseUpdate?: DiseaseUpdate;
  saved: string[];
  errors: string[];
  applied?: boolean;
};

const TARGET_OPTIONS: { key: Target; label: string }[] = [
  { key: "material", label: "📚 学習資料として保存" },
  { key: "org_knowledge", label: "🚀 組織ナレッジに追加（承認待ち）" },
  { key: "manual", label: "📖 マニュアルに変換（下書き）" },
  { key: "disease_update", label: "🔁 疾患データに追記（確認後に反映）" },
];

// 疾患リサーチで選べる視点（スタッフ研修向け・医療エビデンス重視・患者説明向け）
const PERSPECTIVE_OPTIONS = RESEARCH_PERSPECTIVES.filter((p) =>
  (["training", "medical", "patient"] as ResearchPerspective[]).includes(p.id)
);

const TARGET_LABEL: Record<Target, string> = {
  material: "学習資料",
  org_knowledge: "組織ナレッジ",
  manual: "マニュアル",
  disease_update: "疾患データ更新案",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DiseaseResearchModal({
  open,
  onOpenChange,
  diseases,
  onApply,
  onSavedMaterial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  diseases: Disease[];
  onApply: (id: string, partial: Partial<Disease>) => Promise<void>;
  onSavedMaterial?: () => void;
}) {
  const [perspective, setPerspective] = useState<ResearchPerspective>("training");
  const [targets, setTargets] = useState<Record<Target, boolean>>({
    material: true,
    org_knowledge: false,
    manual: false,
    disease_update: false,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<PerResult[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const anyTarget = Object.values(targets).some(Boolean);
  const toggleTarget = (key: Target) =>
    setTargets((prev) => ({ ...prev, [key]: !prev[key] }));

  const run = async () => {
    if (running || !anyTarget || diseases.length === 0) return;
    setRunning(true);
    setResults([]);
    const selectedTargets = (Object.keys(targets) as Target[]).filter((t) => targets[t]);
    const collected: PerResult[] = [];

    for (let i = 0; i < diseases.length; i++) {
      const d = diseases[i];
      setProgress({ index: i + 1, total: diseases.length, name: d.name });
      const entry: PerResult = { disease: d, saved: [], errors: [] };
      try {
        const res = await fetch("/api/admin/deep-research/disease", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diseaseName: d.name,
            diseaseEnglishName: d.nameEn,
            currentData: {
              description: d.description,
              cause: d.cause,
              treatment: d.treatment,
              patientExplanation: d.patientExplanation,
              keyPoints: d.keyPoints,
            },
            perspective,
            targets: selectedTargets,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "リサーチに失敗しました");

        entry.research = json.research?.content || "";
        entry.diseaseUpdate = json.diseaseUpdate;
        if (json.results?.material) entry.saved.push(TARGET_LABEL.material);
        if (json.results?.orgKnowledge) entry.saved.push(TARGET_LABEL.org_knowledge);
        if (json.results?.manual) entry.saved.push(TARGET_LABEL.manual);
        const errs = json.results?.errors || {};
        for (const k of Object.keys(errs)) entry.errors.push(`${TARGET_LABEL[k as Target] || k}: ${errs[k]}`);
      } catch (e) {
        entry.errors.push(e instanceof Error ? e.message : "リサーチに失敗しました");
      }
      collected.push(entry);
      setResults([...collected]);
      // レート制限対策：最後の1件以外は短く待機
      if (i < diseases.length - 1) await sleep(800);
    }

    setProgress(null);
    setRunning(false);
    if (collected.some((r) => r.saved.includes(TARGET_LABEL.material))) onSavedMaterial?.();
  };

  // 疾患更新案を反映
  const applyUpdate = async (r: PerResult) => {
    if (!r.diseaseUpdate) return;
    setApplyingId(r.disease.id);
    const partial: Partial<Disease> = {};
    const u = r.diseaseUpdate;
    if (u.description) partial.description = u.description;
    if (u.cause) partial.cause = u.cause;
    if (u.treatment) partial.treatment = u.treatment;
    if (u.keyPoints?.length) partial.keyPoints = u.keyPoints;
    try {
      await onApply(r.disease.id, partial);
      setResults((prev) =>
        prev.map((x) => (x.disease.id === r.disease.id ? { ...x, applied: true } : x))
      );
    } finally {
      setApplyingId(null);
    }
  };

  const applyAll = async () => {
    for (const r of results) {
      if (r.diseaseUpdate && !r.applied) await applyUpdate(r);
    }
  };

  const pendingUpdates = results.filter((r) => r.diseaseUpdate && !r.applied);

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            🔬 疾患リサーチ
            {diseases.length === 1 ? `：${diseases[0]?.name}` : `（${diseases.length}件を一括）`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 視点 */}
          <div>
            <span className="text-xs font-medium block mb-1.5">リサーチの視点</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PERSPECTIVE_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={running}
                  onClick={() => setPerspective(p.id)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    perspective === p.id
                      ? "border-sky-400 bg-sky-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  } disabled:opacity-50`}
                >
                  <div className="text-sm font-medium text-slate-800">{p.label}</div>
                  <div className="text-xs text-slate-500">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 保存先 */}
          <div>
            <span className="text-xs font-medium block mb-1.5">保存先（複数選択可）</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TARGET_OPTIONS.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <Checkbox
                    checked={targets[t.key]}
                    onCheckedChange={() => toggleTarget(t.key)}
                    disabled={running}
                  />
                  <span className="text-sm text-slate-700">{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={run} disabled={running || !anyTarget}>
            {running ? "リサーチ中…" : "🔬 リサーチ開始"}
          </Button>

          {/* 進捗 */}
          {progress && (
            <div className="text-sm text-sky-700 animate-pulse">
              {progress.index}/{progress.total} {progress.name} をリサーチ中…
            </div>
          )}

          {/* 疾患データ更新案の一括適用 */}
          {pendingUpdates.length > 0 && !running && (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <span className="text-sm text-amber-800">
                疾患データ更新案 {pendingUpdates.length} 件が未適用です
              </span>
              <Button size="sm" onClick={applyAll}>全て適用</Button>
            </div>
          )}

          {/* 結果 */}
          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r) => (
                <div key={r.disease.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800">{r.disease.name}</h4>
                    {r.saved.length > 0 && (
                      <span className="text-xs text-emerald-700">✅ {r.saved.join(" / ")} に保存</span>
                    )}
                  </div>

                  {r.errors.length > 0 && (
                    <ul className="text-xs text-red-600 space-y-0.5">
                      {r.errors.map((e, i) => (
                        <li key={i}>⚠️ {e}</li>
                      ))}
                    </ul>
                  )}

                  {/* 疾患データ更新案（現行 vs 更新案） */}
                  {r.diseaseUpdate && (
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">疾患データ更新案</span>
                        {r.applied ? (
                          <span className="text-xs text-emerald-700">✓ 適用済み</span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => applyUpdate(r)}
                            disabled={applyingId === r.disease.id}
                          >
                            {applyingId === r.disease.id ? "適用中…" : "適用する"}
                          </Button>
                        )}
                      </div>
                      <UpdateDiff label="概要" before={r.disease.description} after={r.diseaseUpdate.description} />
                      <UpdateDiff label="原因・誘因" before={r.disease.cause} after={r.diseaseUpdate.cause} />
                      <UpdateDiff label="治療法" before={r.disease.treatment} after={r.diseaseUpdate.treatment} />
                      {r.diseaseUpdate.keyPoints?.length ? (
                        <div className="text-xs">
                          <div className="font-medium text-slate-600 mb-0.5">重要ポイント（更新案）</div>
                          <ul className="list-disc pl-4 text-slate-700 space-y-0.5">
                            {r.diseaseUpdate.keyPoints.map((k, i) => (
                              <li key={i}>{k}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* リサーチ本文（折りたたみ） */}
                  {r.research && (
                    <details>
                      <summary className="text-xs text-sky-600 cursor-pointer">リサーチ本文を表示</summary>
                      <div className="mt-2">
                        <MarkdownView>{r.research}</MarkdownView>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 現行値と更新案を縦に並べる小コンポーネント */
function UpdateDiff({ label, before, after }: { label: string; before?: string; after?: string }) {
  if (!after) return null;
  return (
    <div className="text-xs">
      <div className="font-medium text-slate-600 mb-0.5">{label}</div>
      <div className="text-slate-400 line-through decoration-slate-300">{before || "（未記入）"}</div>
      <div className="text-slate-800">{after}</div>
    </div>
  );
}
