"use client";

// 🔬 ディープリサーチ（STEP 1: リサーチ実行＋結果表示＋保存＋履歴）
// ※ AI は全経路 Gemini 3.5 Flash（リサーチは検索Grounding）。SSEストリーミングで進捗表示。
// ※ 保存は content_store（案A: インデックス＋本体分離）。学習資料生成/公開/整理は STEP 2 以降。

import { useState, useEffect, useRef, useCallback } from "react";
import {
  RESEARCH_MODES,
  RESEARCH_PERSPECTIVES,
  DERIVED_MATERIAL_META,
  type ResearchMode,
  type ResearchPerspective,
  type DerivedMaterialIndexItem,
  type DerivedMaterial,
} from "@/lib/deep-research/types";
import type { ResearchIndexItem } from "@/lib/deep-research/store";
import { MarkdownView } from "@/components/deep-research/MarkdownView";
import { LearningMaterials } from "@/components/deep-research/LearningMaterials";
import { ResearchActions } from "@/components/deep-research/ResearchActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** SSEイベントのステージ → 日本語ラベル */
const STAGE_LABELS: Record<string, string> = {
  preparing: "準備中…",
  searching: "Web検索中…",
  writing: "執筆中…",
  finalizing: "仕上げ中…",
};

type Source = { title: string; url: string };

export default function DeepResearchPage() {
  // 入力
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<ResearchMode>("standard");
  const [perspective, setPerspective] = useState<ResearchPerspective>("general");
  const [additionalContext, setAdditionalContext] = useState("");

  // 実行・結果
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState("");
  const [resultTopic, setResultTopic] = useState(""); // 実行時に確定したトピック（生成/保存はこれを使う）
  const [resultPerspective, setResultPerspective] = useState<ResearchPerspective>("general");
  const [sources, setSources] = useState<Source[]>([]);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 経過秒
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 保存
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // 履歴
  const [history, setHistory] = useState<ResearchIndexItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState("");
  const [expandedSources, setExpandedSources] = useState<Source[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 保存した学習資料
  const [materials, setMaterials] = useState<DerivedMaterialIndexItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
  const [expandedMaterial, setExpandedMaterial] = useState<DerivedMaterial | null>(null);
  const [loadingMaterialDetail, setLoadingMaterialDetail] = useState(false);

  // 学習資料一覧の読み込み
  const loadMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const res = await fetch("/api/admin/deep-research/materials");
      const json = await res.json();
      if (res.ok) setMaterials(json.results || []);
    } catch {
      // 一覧取得失敗は致命ではないので握りつぶす
    } finally {
      setLoadingMaterials(false);
    }
  }, []);

  // 履歴の読み込み
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/deep-research/list");
      const json = await res.json();
      if (res.ok) setHistory(json.results || []);
    } catch {
      // 一覧取得失敗は致命ではないので握りつぶす
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadMaterials();
  }, [loadHistory, loadMaterials]);

  // 学習資料の展開（本体取得）
  const toggleMaterial = async (id: string) => {
    if (expandedMaterialId === id) {
      setExpandedMaterialId(null);
      setExpandedMaterial(null);
      return;
    }
    setExpandedMaterialId(id);
    setExpandedMaterial(null);
    setLoadingMaterialDetail(true);
    try {
      const res = await fetch(`/api/admin/deep-research/materials?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (res.ok && json.result) setExpandedMaterial(json.result as DerivedMaterial);
    } catch {
      // 取得失敗時は空表示
    } finally {
      setLoadingMaterialDetail(false);
    }
  };

  // 学習資料の削除
  const removeMaterial = async (id: string) => {
    if (!confirm("この学習資料を削除しますか？")) return;
    try {
      const res = await fetch(`/api/admin/deep-research/materials?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (expandedMaterialId === id) setExpandedMaterialId(null);
        await loadMaterials();
      }
    } catch {
      // 握りつぶし
    }
  };

  // 経過タイマー
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  // リサーチ実行（SSE）
  const runResearch = async () => {
    if (!topic.trim() || running) return;
    setRunning(true);
    setError("");
    setResult("");
    setResultTopic(topic);
    setResultPerspective(perspective);
    setSources([]);
    setUsedModel(null);
    setStage("preparing");
    setSavedOk(false);

    try {
      const res = await fetch("/api/admin/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, mode, perspective, additionalContext }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "リサーチの開始に失敗しました");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const evt of events) {
          const jsonStr = evt
            .split(/\r?\n/)
            .filter((l) => l.startsWith("data: "))
            .map((l) => l.slice(6))
            .join("");
          if (!jsonStr) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          switch (data.type) {
            case "stage":
              setStage(String(data.stage || ""));
              break;
            case "text":
              setResult((prev) => prev + String(data.content || ""));
              break;
            case "sources":
              setSources((data.sources as Source[]) || []);
              break;
            case "done":
              setUsedModel((data.model_used as string) || null);
              break;
            case "error":
              setError(String(data.message || "リサーチ中にエラーが発生しました"));
              break;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "リサーチに失敗しました");
    } finally {
      setRunning(false);
      setStage("");
    }
  };

  // 結果を保存
  const saveResult = async () => {
    if (!result.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/deep-research/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: resultTopic || topic, mode, content: result, sources, model: usedModel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setSavedOk(true);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // 履歴の展開（本体を取得）
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedContent("");
      setExpandedSources([]);
      return;
    }
    setExpandedId(id);
    setExpandedContent("");
    setExpandedSources([]);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/deep-research/list?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (res.ok && json.result) {
        setExpandedContent(json.result.content || "");
        setExpandedSources(json.result.sources || []);
      }
    } catch {
      // 取得失敗時は空表示
    } finally {
      setLoadingDetail(false);
    }
  };

  // 履歴の削除
  const removeHistory = async (id: string) => {
    if (!confirm("この履歴を削除しますか？")) return;
    try {
      const res = await fetch(`/api/admin/deep-research/list?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (expandedId === id) setExpandedId(null);
        await loadHistory();
      }
    } catch {
      // 握りつぶし
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🔬 ディープリサーチ</h1>
        <p className="text-sm text-slate-600 mt-1">
          トピックを入力すると、Web検索を使って調査し Markdown レポートを生成します（Gemini 3.5 Flash）。
        </p>
      </div>

      {/* 入力フォーム */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">リサーチするトピック</label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例：アトピー性皮膚炎の最新治療（JAK阻害薬）"
            disabled={running}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">分量モード</label>
          <div className="flex flex-wrap gap-2">
            {RESEARCH_MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={running}
                onClick={() => setMode(m.mode)}
                className={`flex-1 min-w-[150px] text-left rounded-lg border px-3 py-2 transition-colors ${
                  mode === m.mode
                    ? "border-sky-400 bg-sky-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                } disabled:opacity-50`}
              >
                <div className="text-sm font-medium text-slate-800">
                  {m.icon} {m.label}
                </div>
                <div className="text-xs text-slate-600">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">リサーチの視点</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RESEARCH_PERSPECTIVES.map((p) => (
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
                <div className="text-xs text-slate-600">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">追加要件（任意）</label>
          <Textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="例：当院スタッフ向け。専門用語は補足を付けて。"
            rows={2}
            disabled={running}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={runResearch} disabled={running || !topic.trim()}>
            {running ? "リサーチ中…" : "🔍 リサーチ実行"}
          </Button>
          {running && (
            <span className="text-sm text-slate-600">
              {STAGE_LABELS[stage] || "処理中…"}（{elapsed}秒）
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* 結果表示 */}
      {(result || running) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">リサーチ結果</h2>
            <div className="flex items-center gap-2">
              {usedModel && <Badge variant="secondary">{usedModel}</Badge>}
              <Button variant="outline" onClick={saveResult} disabled={!result.trim() || saving || running}>
                {saving ? "保存中…" : savedOk ? "✓ 保存しました" : "💾 保存"}
              </Button>
            </div>
          </div>

          {result ? (
            <MarkdownView>{result}</MarkdownView>
          ) : (
            <p className="text-sm text-slate-600">{STAGE_LABELS[stage] || "生成を待っています…"}</p>
          )}

          {sources.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-1.5">情報源（{sources.length}件）</h3>
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="text-xs">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 underline hover:text-sky-700"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && !running && (
            <div className="pt-4 border-t border-slate-100 space-y-6">
              <ResearchActions
                topic={resultTopic || topic}
                content={result}
                perspective={resultPerspective}
              />
              <LearningMaterials topic={resultTopic || topic} content={result} onSaved={loadMaterials} />
            </div>
          )}
        </div>
      )}

      {/* 履歴一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-800">保存済みリサーチ履歴</h2>
          <Button variant="ghost" size="sm" onClick={loadHistory} disabled={loadingHistory}>
            {loadingHistory ? "読込中…" : "🔄 更新"}
          </Button>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-600">まだ保存された履歴はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(h.id)}
                    className="text-left flex-1"
                  >
                    <div className="text-sm font-medium text-slate-800">{h.topic}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {new Date(h.createdAt).toLocaleString("ja-JP")}
                      {h.mode ? ` ・ ${h.mode}` : ""}
                      {h.model ? ` ・ ${h.model}` : ""}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHistory(h.id)}
                    className="text-red-600"
                  >
                    削除
                  </Button>
                </div>

                {expandedId === h.id && (
                  <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-4">
                    {loadingDetail ? (
                      <p className="text-sm text-slate-600">読み込み中…</p>
                    ) : (
                      <>
                        <MarkdownView>{expandedContent}</MarkdownView>
                        {expandedSources.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-slate-200">
                            <h4 className="text-xs font-semibold text-slate-600 mb-1">情報源</h4>
                            <ul className="space-y-1">
                              {expandedSources.map((s, i) => (
                                <li key={i} className="text-xs">
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sky-600 underline hover:text-sky-700"
                                  >
                                    {s.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {expandedContent && (
                          <div className="pt-4 mt-4 border-t border-slate-200 space-y-6">
                            <ResearchActions
                              topic={h.topic}
                              content={expandedContent}
                              perspective="general"
                            />
                            <LearningMaterials topic={h.topic} content={expandedContent} onSaved={loadMaterials} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 保存した学習資料一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-800">📚 保存した学習資料</h2>
          <Button variant="ghost" size="sm" onClick={loadMaterials} disabled={loadingMaterials}>
            {loadingMaterials ? "読込中…" : "🔄 更新"}
          </Button>
        </div>

        {materials.length === 0 ? (
          <p className="text-sm text-slate-600">まだ保存された学習資料はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {materials.map((m) => {
              const meta = DERIVED_MATERIAL_META[m.type];
              return (
                <li key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMaterial(m.id)}
                      className="text-left flex-1"
                    >
                      <div className="text-sm font-medium text-slate-800">
                        <span className="mr-1">{meta?.icon ?? "📄"}</span>
                        {m.title}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {meta?.label ?? m.type} ・ {new Date(m.createdAt).toLocaleString("ja-JP")}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMaterial(m.id)}
                      className="text-red-600"
                    >
                      削除
                    </Button>
                  </div>

                  {expandedMaterialId === m.id && (
                    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-4">
                      {loadingMaterialDetail ? (
                        <p className="text-sm text-slate-600">読み込み中…</p>
                      ) : expandedMaterial ? (
                        meta?.render === "plain" ? (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                            {expandedMaterial.content}
                          </pre>
                        ) : (
                          <MarkdownView>{expandedMaterial.content}</MarkdownView>
                        )
                      ) : (
                        <p className="text-sm text-slate-600">本体を取得できませんでした。</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
