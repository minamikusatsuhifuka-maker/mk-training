"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import type { GeneratedResult } from "@/components/admin/AIGeneratePanel";

type Candidate = {
  name: string;
  genericName: string;
  category: string;
};

type Step = "input" | "candidates" | "generating" | "preview";

type Props = {
  onGenerated: (results: GeneratedResult[]) => void;
  placeholderExamples: string[];
};

export function DrugCandidatePanel({ onGenerated, placeholderExamples }: Props) {
  const [aiInput, setAiInput] = useState("");
  const [aiQuality, setAiQuality] = useState<"fast" | "quality">("quality");
  const [step, setStep] = useState<Step>("input");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [generatedDrugs, setGeneratedDrugs] = useState<GeneratedResult[]>([]);
  const [selectedGenIds, setSelectedGenIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, completed: 0 });

  const placeholder = placeholderExamples.join("\n");

  const reset = () => {
    setAiInput("");
    setStep("input");
    setCandidates([]);
    setSelectedCandidates(new Set());
    setGeneratedDrugs([]);
    setSelectedGenIds(new Set());
    setSearchError(null);
    setProgress({ total: 0, completed: 0 });
  };

  // Step1→Step2: 候補を検索
  const handleSearchCandidates = async () => {
    if (!aiInput.trim()) return;
    setSearchingCandidates(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/drug-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: aiInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "候補の取得に失敗しました");
        setSearchingCandidates(false);
        return;
      }
      const list: Candidate[] = data.candidates ?? [];
      setCandidates(list);
      setSelectedCandidates(new Set(list.map((_, i) => i)));
      setStep("candidates");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "ネットワークエラー");
    } finally {
      setSearchingCandidates(false);
    }
  };

  // Step3: 選択した候補を順次詳細生成
  const handleGenerateSelected = async () => {
    const selected = candidates.filter((_, i) => selectedCandidates.has(i));
    if (selected.length === 0) return;
    setIsGenerating(true);
    setStep("generating");
    setProgress({ total: selected.length, completed: 0 });

    const results: GeneratedResult[] = [];

    // /api/ai-generate は配列での同時生成にも対応するが、進捗を見せるため逐次実行
    for (let i = 0; i < selected.length; i++) {
      const candidate = selected[i];
      try {
        const res = await fetch("/api/ai-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "drug",
            keywords: [candidate.name],
            mode: aiQuality,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "不明なエラー" }));
          results.push({
            id: `cand_${Date.now()}_${i}`,
            keyword: candidate.name,
            data: null,
            error: err.error ?? "APIエラー",
          });
        } else {
          const body = await res.json();
          const r = body.results?.[0];
          results.push({
            id: `cand_${Date.now()}_${i}`,
            keyword: candidate.name,
            data: r?.data ?? null,
            error: r?.error ?? null,
          });
        }
      } catch (e) {
        results.push({
          id: `cand_${Date.now()}_${i}`,
          keyword: candidate.name,
          data: null,
          error: e instanceof Error ? e.message : "ネットワークエラー",
        });
      }
      setProgress({ total: selected.length, completed: i + 1 });
    }

    setGeneratedDrugs(results);
    setSelectedGenIds(new Set(results.filter((r) => r.data).map((r) => r.id)));
    setIsGenerating(false);
    setStep("preview");
  };

  const handleRetryGen = async (keyword: string, resultId: string) => {
    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "drug", keywords: [keyword], mode: aiQuality }),
      });
      if (!res.ok) return;
      const body = await res.json();
      const r = body.results?.[0];
      setGeneratedDrugs((prev) =>
        prev.map((item) =>
          item.id === resultId ? { ...item, data: r?.data ?? null, error: r?.error ?? null } : item
        )
      );
      if (r?.data) {
        setSelectedGenIds((prev) => new Set([...prev, resultId]));
      }
    } catch {
      /* noop */
    }
  };

  const toggleGenSelect = (id: string) => {
    setSelectedGenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRegister = () => {
    const selected = generatedDrugs.filter((r) => selectedGenIds.has(r.id) && r.data);
    if (selected.length === 0) return;
    onGenerated(selected);
    reset();
  };

  const renderPreview = (data: Record<string, unknown>) => {
    const entries = Object.entries(data).slice(0, 4);
    return (
      <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
        {entries.map(([key, val]) => (
          <p key={key} className="truncate">
            <span className="font-medium text-foreground">{key}:</span>{" "}
            {Array.isArray(val) ? val.join(", ") : String(val)}
          </p>
        ))}
      </div>
    );
  };

  const selectedGenCount = generatedDrugs.filter(
    (r) => selectedGenIds.has(r.id) && r.data
  ).length;
  const pct =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <Card className="p-4 space-y-4 border-dashed border-2 border-slate-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          AI候補検索 → 詳細生成
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            （Step {step === "input" ? 1 : step === "candidates" ? 2 : step === "generating" ? 3 : 4} / 4）
          </span>
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAiQuality("fast")}
            className={`px-2 py-1 rounded ${
              aiQuality === "fast" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            速度優先
          </button>
          <button
            type="button"
            onClick={() => setAiQuality("quality")}
            className={`px-2 py-1 rounded ${
              aiQuality === "quality" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            品質優先
          </button>
        </div>
      </div>

      {/* Step1: キーワード入力 */}
      {step === "input" && (
        <div className="space-y-3">
          <Textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            rows={3}
            placeholder={placeholder || "例：アレルギー性結膜炎の点眼薬\nニキビ治療の外用抗菌薬\nアトピーの生物学的製剤"}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            カテゴリ・症状・薬効でも検索できます（自由記述）
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleSearchCandidates}
              disabled={searchingCandidates || !aiInput.trim()}
              className="flex-1"
            >
              {searchingCandidates ? "🔍 検索中..." : "🔍 候補薬剤を検索"}
            </Button>
          </div>
          {searchError && (
            <p className="text-xs text-red-600">{searchError}</p>
          )}
        </div>
      )}

      {/* Step2: 候補リスト表示 */}
      {step === "candidates" && candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              「{aiInput}」の候補薬剤 ({candidates.length}件)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCandidates(new Set(candidates.map((_, i) => i)))}
                className="text-xs text-teal hover:underline"
              >
                全選択
              </button>
              <button
                onClick={() => setSelectedCandidates(new Set())}
                className="text-xs text-slate-500 hover:underline"
              >
                全解除
              </button>
            </div>
          </div>

          <div className="grid gap-2 max-h-72 overflow-y-auto">
            {candidates.map((c, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${
                  selectedCandidates.has(i)
                    ? "border-teal/40 bg-teal-light/40"
                    : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCandidates.has(i)}
                  onChange={(e) => {
                    setSelectedCandidates((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {c.genericName && (
                      <span className="text-xs text-slate-600">{c.genericName}</span>
                    )}
                    {c.category && (
                      <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {c.category}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerateSelected}
              disabled={selectedCandidates.size === 0 || isGenerating}
              className="flex-1"
            >
              {isGenerating ? "⏳ 生成中..." : `✨ 選択した${selectedCandidates.size}件の詳細を生成`}
            </Button>
            <Button variant="outline" onClick={() => setStep("input")}>
              ← 戻る
            </Button>
          </div>
        </div>
      )}

      {step === "candidates" && candidates.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">候補が見つかりませんでした。キーワードを変えて再検索してください。</p>
          <Button variant="outline" onClick={() => setStep("input")}>← 戻る</Button>
        </div>
      )}

      {/* Step3: 生成中 */}
      {step === "generating" && (
        <div className="space-y-2">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            {progress.completed}/{progress.total}件完了
          </p>
        </div>
      )}

      {/* Step4: プレビュー（チェックして登録） */}
      {step === "preview" && generatedDrugs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">生成結果プレビュー:</p>
            <button onClick={reset} className="text-xs text-slate-500 hover:underline">
              最初からやり直す
            </button>
          </div>
          {generatedDrugs.map((r) => (
            <div
              key={r.id}
              className={`rounded-md border p-3 text-sm ${
                r.error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                {r.data && (
                  <Checkbox
                    checked={selectedGenIds.has(r.id)}
                    onCheckedChange={() => toggleGenSelect(r.id)}
                    className="mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{r.data ? "✅" : "❌"}</span>
                    <span className="font-medium">{r.keyword}</span>
                  </div>
                  {r.error && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-red-600">{r.error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetryGen(r.keyword, r.id)}
                        className="text-xs h-6 px-2"
                      >
                        再生成
                      </Button>
                    </div>
                  )}
                  {r.data && renderPreview(r.data as Record<string, unknown>)}
                </div>
              </div>
            </div>
          ))}

          {selectedGenCount > 0 && (
            <Button onClick={handleRegister} className="w-full">
              チェックした {selectedGenCount}件を登録する
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
