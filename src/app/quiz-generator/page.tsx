"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { quizQuestions as initialQuiz, type QuizQuestion, type QuizCategory } from "@/data/quiz";
import { KNOWLEDGE_DOCS_KEY, type KnowledgeDoc } from "@/lib/clinic-philosophy";
import { PageHeader } from "@/components/PageHeader";

type GeneratedQuiz = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
};

type Source = "knowledge" | "text";
type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "易" },
  { value: "medium", label: "中" },
  { value: "hard", label: "難" },
];

const COUNT_OPTIONS = [5, 10, 20];

// AI生成カテゴリの自動マッピング
function mapCategory(raw: string): QuizCategory {
  const lower = raw.toLowerCase();
  if (raw.includes("疾患") || lower.includes("disease")) return "disease";
  if (raw.includes("薬") || lower.includes("drug")) return "drug";
  if (raw.includes("美容") || lower.includes("cosmetic") || raw.includes("施術")) return "cosmetic";
  if (raw.includes("業務") || raw.includes("接遇") || lower.includes("ops")) return "ops";
  return "disease";
}

export default function QuizGeneratorPage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);

  const [source, setSource] = useState<Source>("knowledge");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [pastedText, setPastedText] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [defaultCategory, setDefaultCategory] = useState<QuizCategory>("disease");

  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generated, setGenerated] = useState<GeneratedQuiz[]>([]);

  // 知識ベース読み込み
  useEffect(() => {
    (async () => {
      setDocsLoading(true);
      try {
        const { data } = await supabase
          .from("content_store")
          .select("data")
          .eq("id", KNOWLEDGE_DOCS_KEY)
          .single();
        const raw = (data?.data as { docs?: KnowledgeDoc[] } | undefined) || {};
        const list = (raw.docs || []).filter((d) => d.isActive);
        setDocs(list);
        if (list.length > 0) setSelectedDocId(list[0].id);
      } catch {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    })();
  }, []);

  // メッセージ自動消去
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const generate = async () => {
    setError("");
    setSuccess("");
    setGenerated([]);

    let content = "";
    if (source === "knowledge") {
      const doc = docs.find((d) => d.id === selectedDocId);
      if (!doc) {
        setError("資料を選択してください");
        return;
      }
      content = doc.content;
    } else {
      content = pastedText.trim();
      if (!content) {
        setError("テキストを入力してください");
        return;
      }
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/quiz-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, count, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "クイズ生成に失敗しました");
      }
      const quizzes: GeneratedQuiz[] = data.quizzes || [];
      if (quizzes.length === 0) {
        setError("クイズを生成できませんでした。資料の内容を確認してください。");
      } else {
        setGenerated(quizzes);
        setSuccess(`✅ ${quizzes.length}問のクイズを生成しました`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setGenerating(false);
    }
  };

  // クイズDBに追加
  const addToQuizDb = async () => {
    if (generated.length === 0) return;
    setAdding(true);
    setError("");
    try {
      const existing = await getContent<QuizQuestion>(CONTENT_KEYS.quiz, initialQuiz);
      const ts = Date.now();
      const newQuestions: QuizQuestion[] = generated.map((g, i) => ({
        id: `qg_${ts}_${i}`,
        category: mapCategory(g.category) || defaultCategory,
        question: g.question,
        options: g.options,
        answerIndex: g.correct,
        explanation: g.explanation,
      }));
      const merged = [...existing, ...newQuestions];
      const ok = await saveContent(CONTENT_KEYS.quiz, merged);
      if (ok) {
        setSuccess(`✅ クイズDBに ${newQuestions.length}問 を追加しました（合計 ${merged.length}問）`);
        setGenerated([]);
      } else {
        setError("DBへの保存に失敗しました（ローカルには保存されました）");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "DB追加エラー");
    } finally {
      setAdding(false);
    }
  };

  const removeOne = (idx: number) => {
    setGenerated((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="📝 資料からクイズを自動生成"
        description="知識ベースの資料・任意のテキストから、AIがクイズを自動生成します"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{success}</div>
      )}

      {/* 設定パネル */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        {/* 資料ソース */}
        <div>
          <label className="text-xs font-medium text-gray-600 mb-2 block">資料ソース *</label>
          <div className="flex gap-1 border rounded-lg overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => setSource("knowledge")}
              className={`text-sm px-3 py-1.5 ${source === "knowledge" ? "bg-teal-600 text-white" : "hover:bg-gray-50"}`}
            >
              📚 知識ベースから選ぶ
            </button>
            <button
              type="button"
              onClick={() => setSource("text")}
              className={`text-sm px-3 py-1.5 ${source === "text" ? "bg-teal-600 text-white" : "hover:bg-gray-50"}`}
            >
              ✏️ テキスト直接入力
            </button>
          </div>
        </div>

        {source === "knowledge" ? (
          <div>
            <label className="text-xs font-medium text-gray-600">資料を選択</label>
            {docsLoading ? (
              <p className="text-sm text-gray-600 mt-1">読み込み中...</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-gray-600 mt-1">
                有効な資料がありません。
                <a href="/admin/knowledge" className="text-teal-600 underline ml-1">
                  知識ベースに追加
                </a>
              </p>
            ) : (
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              >
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}（{(d.charCount ?? d.content.length).toLocaleString()}文字）
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-gray-600">テキスト *</label>
              <span className="text-xs text-gray-600">{pastedText.length.toLocaleString()}文字</span>
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={8}
              placeholder="クイズの元になる資料テキストを貼り付けてください..."
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
        )}

        {/* 問題数・難易度 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">問題数</label>
            <div className="flex gap-1 mt-1">
              {COUNT_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCount(c)}
                  className={`flex-1 text-sm px-3 py-1.5 border rounded ${
                    count === c ? "bg-teal-600 text-white border-teal-600" : "hover:bg-gray-50"
                  }`}
                >
                  {c}問
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">難易度</label>
            <div className="flex gap-1 mt-1">
              {DIFFICULTY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 text-sm px-3 py-1.5 border rounded ${
                    difficulty === d.value ? "bg-teal-600 text-white border-teal-600" : "hover:bg-gray-50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">DB追加時のデフォルトカテゴリ（AI判定優先）</label>
          <select
            value={defaultCategory}
            onChange={(e) => setDefaultCategory(e.target.value as QuizCategory)}
            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
          >
            <option value="disease">疾患</option>
            <option value="drug">薬剤</option>
            <option value="cosmetic">美容</option>
            <option value="ops">業務</option>
          </select>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="w-full px-4 py-3 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {generating ? "⏳ 生成中..." : "✨ クイズを生成"}
        </button>
      </div>

      {/* 生成結果 */}
      {generated.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">生成されたクイズ ({generated.length}問)</h2>
            <button
              type="button"
              onClick={addToQuizDb}
              disabled={adding}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {adding ? "追加中..." : "💾 クイズDBに追加"}
            </button>
          </div>

          {generated.map((q, idx) => (
            <div key={idx} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Q{idx + 1}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      {q.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800">{q.question}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeOne(idx)}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 shrink-0"
                >
                  削除
                </button>
              </div>
              <div className="space-y-1">
                {q.options.map((opt, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded px-3 py-1.5 border ${
                      i === q.correct
                        ? "bg-green-50 border-green-300 text-green-900 font-medium"
                        : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}. {opt}
                    {i === q.correct && <span className="ml-2 text-xs">✓ 正解</span>}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900">
                <span className="font-medium">解説:</span> {q.explanation}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
