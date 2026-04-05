"use client";

import { useState } from "react";

type BatchResultItem = {
  id: string;
  name: string;
  isCorrect: boolean;
  severity: "none" | "low" | "medium" | "high";
  issues: string[];
  newKnowledge: string[];
  corrections: Record<string, string>;
  confidence: string;
};

type BatchResult = {
  summary: string;
  totalItems: number;
  issuesFound: number;
  results: BatchResultItem[];
  model: string;
};

type Props = {
  contentType: string;
  selectedItems: { id: string; name: string; data: object }[];
  onClear: () => void;
};

const severityColor: Record<string, string> = {
  none: "bg-green-100 text-green-700",
  low: "bg-yellow-100 text-yellow-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

const severityLabel: Record<string, string> = {
  none: "✅ 問題なし",
  low: "⚠️ 軽微",
  medium: "⚠️ 要確認",
  high: "🚨 要修正",
};

export function GeminiBatchVerify({ contentType, selectedItems, onClear }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  if (selectedItems.length === 0) return null;

  const handleBatchVerify = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, items: selectedItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setShowResult(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("エラー: " + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 選択中バナー（固定フッター） */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between z-40 shadow-lg">
        <span className="text-sm font-medium">{selectedItems.length}件選択中</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="text-sm px-3 py-1.5 border border-white/30 rounded-lg hover:bg-white/10"
          >
            選択解除
          </button>
          <button
            type="button"
            onClick={handleBatchVerify}
            disabled={loading}
            className="text-sm px-4 py-1.5 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span> Gemini 2.5 Proが評価中...
              </>
            ) : (
              <>🔍 Gemini 2.5 Proで一括評価</>
            )}
          </button>
        </div>
      </div>

      {/* 結果ダイアログ */}
      {showResult && result && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[85vh] flex flex-col">
            {/* ヘッダー */}
            <div className="p-5 border-b">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg">🔍 Gemini 2.5 Pro 一括評価結果</h3>
                <button
                  type="button"
                  onClick={() => setShowResult(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-600">{result.summary}</p>
              <div className="flex gap-3 mt-3">
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  評価数: {result.totalItems}件
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    result.issuesFound > 0
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  問題あり: {result.issuesFound}件
                </span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                  {result.model}
                </span>
              </div>
            </div>

            {/* 結果リスト */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {result.results?.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-3 ${
                    item.severity !== "none" ? "border-orange-200" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{item.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        severityColor[item.severity] ?? severityColor.none
                      }`}
                    >
                      {severityLabel[item.severity] ?? severityLabel.none}
                    </span>
                  </div>

                  {item.issues?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-orange-700 mb-1">⚠️ 問題点:</p>
                      <ul className="text-xs text-orange-800 space-y-0.5">
                        {item.issues.map((issue, i) => (
                          <li key={i} className="flex gap-1">
                            <span>•</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.newKnowledge?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-blue-700 mb-1">
                        💡 新しい知見・変更点:
                      </p>
                      <ul className="text-xs text-blue-800 space-y-0.5">
                        {item.newKnowledge.map((k, i) => (
                          <li key={i} className="flex gap-1">
                            <span>•</span>
                            <span>{k}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.corrections && Object.keys(item.corrections).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-teal-700 mb-1">✏️ 修正案:</p>
                      {Object.entries(item.corrections).map(([field, value]) => (
                        <p key={field} className="text-xs text-teal-800">
                          <span className="font-medium">{field}:</span> {String(value)}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-1">確信度: {item.confidence}</p>
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="p-4 border-t">
              <button
                type="button"
                onClick={() => setShowResult(false)}
                className="w-full border rounded-lg py-2 text-sm hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
