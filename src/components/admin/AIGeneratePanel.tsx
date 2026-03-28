"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

export type GeneratedResult = {
  id: string;
  keyword: string;
  data: Record<string, unknown> | null;
  error: string | null;
};

type Props = {
  type: "drug" | "disease" | "quiz" | "contraindication";
  onGenerated: (results: GeneratedResult[]) => void;
  placeholderExamples: string[];
};

export function AIGeneratePanel({ type, onGenerated, placeholderExamples }: Props) {
  const [keywords, setKeywords] = useState("");
  const [mode, setMode] = useState<"fast" | "quality">("fast");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ total: 0, completed: 0 });

  const placeholder = placeholderExamples.join("\n");
  const typeLabel = type === "quiz" ? "テーマ" : "キーワード";

  const handleGenerate = async () => {
    const lines = keywords
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (lines.length === 0) return;

    setIsGenerating(true);
    setResults([]);
    setSelectedIds(new Set());
    setProgress({ total: lines.length, completed: 0 });

    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, keywords: lines, mode }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "不明なエラー" }));
        setResults(
          lines.map((kw, i) => ({
            id: `err_${Date.now()}_${i}`,
            keyword: kw,
            data: null,
            error: err.error ?? "APIエラー",
          }))
        );
        setProgress({ total: lines.length, completed: lines.length });
        setIsGenerating(false);
        return;
      }

      const body = await res.json();
      const generated: GeneratedResult[] = body.results.map(
        (r: { keyword: string; data: Record<string, unknown> | null; error: string | null }, i: number) => {
          const id = `ai_${Date.now()}_${i}`;
          return { id, keyword: r.keyword, data: r.data, error: r.error };
        }
      );

      setResults(generated);
      const successIds = new Set(generated.filter((r) => r.data).map((r) => r.id));
      setSelectedIds(successIds);
      setProgress({ total: lines.length, completed: lines.length });
    } catch (e) {
      setResults(
        lines.map((kw, i) => ({
          id: `err_${Date.now()}_${i}`,
          keyword: kw,
          data: null,
          error: e instanceof Error ? e.message : "ネットワークエラー",
        }))
      );
      setProgress({ total: lines.length, completed: lines.length });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = async (keyword: string, resultId: string) => {
    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, keywords: [keyword], mode }),
      });
      if (!res.ok) return;
      const body = await res.json();
      const r = body.results[0];
      setResults((prev) =>
        prev.map((item) =>
          item.id === resultId ? { ...item, data: r.data, error: r.error } : item
        )
      );
      if (r.data) {
        setSelectedIds((prev) => new Set([...prev, resultId]));
      }
    } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRegister = () => {
    const selected = results.filter((r) => selectedIds.has(r.id) && r.data);
    if (selected.length === 0) return;
    onGenerated(selected);
    setResults([]);
    setSelectedIds(new Set());
    setKeywords("");
  };

  const selectedCount = results.filter((r) => selectedIds.has(r.id) && r.data).length;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

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

  return (
    <Card className="p-4 space-y-4 border-dashed border-2 border-slate-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">AI自動生成</h3>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode("fast")}
            className={`px-2 py-1 rounded ${mode === "fast" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            速度優先
          </button>
          <button
            type="button"
            onClick={() => setMode("quality")}
            className={`px-2 py-1 rounded ${mode === "quality" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            品質優先
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="space-y-1">
        <Textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          1行1{typeLabel}（最大10件まで同時生成可能）
        </p>
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={isGenerating || !keywords.trim()} className="w-full">
        {isGenerating ? "生成中..." : "AI生成開始"}
      </Button>

      {/* Progress */}
      {isGenerating && (
        <div className="space-y-2">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            {progress.completed}/{progress.total}件完了
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">生成結果プレビュー:</p>
          {results.map((r) => (
            <div
              key={r.id}
              className={`rounded-md border p-3 text-sm ${
                r.error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                {r.data && (
                  <Checkbox
                    checked={selectedIds.has(r.id)}
                    onCheckedChange={() => toggleSelect(r.id)}
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
                        onClick={() => handleRetry(r.keyword, r.id)}
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

          {/* Register button */}
          {selectedCount > 0 && (
            <Button onClick={handleRegister} className="w-full">
              チェックした {selectedCount}件を登録する
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
