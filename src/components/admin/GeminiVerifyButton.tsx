"use client";

import { useState } from "react";

type ContraindicationInfo = {
  absolute?: string[];
  caution?: string[];
  pregnancy?: string;
  lactation?: string;
  pediatric?: string;
  elderly?: string;
};

type VerifyResult = {
  isCorrect: boolean;
  issues: string[];
  corrections: Record<string, string>;
  contraindications?: ContraindicationInfo;
  confidence: string;
  model: string;
  checkedAt: string;
};

type Props = {
  contentType: string;
  itemName: string;
  currentData: object;
  onApply?: (corrections: Record<string, string>) => void;
  size?: "sm" | "md";
};

export function GeminiVerifyButton({
  contentType,
  itemName,
  currentData,
  onApply,
  size = "sm",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, itemName, currentData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "APIエラー");
      setResult(data);
      setShowResult(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("エラー: " + message);
    } finally {
      setLoading(false);
    }
  };

  const btnClass =
    size === "sm"
      ? "text-xs px-2 py-1 border rounded flex items-center gap-1 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors disabled:opacity-50"
      : "text-sm px-3 py-1.5 border rounded-lg flex items-center gap-1.5 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors disabled:opacity-50";

  return (
    <>
      <button
        onClick={handleVerify}
        disabled={loading}
        className={btnClass}
        title="Gemini 2.5 Proで内容を確認"
      >
        <span className={loading ? "animate-spin inline-block" : ""}>
          {loading ? "⟳" : "🔍"}
        </span>
        {size === "md" && (
          <span>{loading ? "確認中..." : "AI確認"}</span>
        )}
      </button>

      {showResult && result && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {result.isCorrect ? "✅" : "⚠️"} Gemini 2.5 Pro 確認結果
              </h3>
              <button
                onClick={() => setShowResult(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-3">
              確認対象:{" "}
              <span className="font-medium text-gray-800">{itemName}</span>
            </p>

            {result.isCorrect ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-700 font-medium">
                  内容に問題は見つかりませんでした
                </p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-amber-700 font-medium mb-2">問題点:</p>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    {(result.issues || []).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
                {result.corrections &&
                  Object.keys(result.corrections).length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-700 font-medium mb-2">修正案:</p>
                      {Object.entries(result.corrections).map(
                        ([field, value]) => (
                          <div key={field} className="text-sm mb-1">
                            <span className="font-medium">{field}:</span>{" "}
                            <span className="text-blue-700">
                              {String(value)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </div>
            )}

            {result.contraindications && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-red-700 mb-2">🚫 禁忌・使用上の注意:</p>

                {result.contraindications.absolute && result.contraindications.absolute.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-red-600">絶対禁忌:</p>
                    <ul className="text-xs text-red-800 space-y-0.5 list-none">
                      {result.contraindications.absolute.map((c, i) => (
                        <li key={i} className="flex gap-1"><span>•</span><span>{c}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.contraindications.caution && result.contraindications.caution.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-orange-600">慎重投与:</p>
                    <ul className="text-xs text-orange-800 space-y-0.5 list-none">
                      {result.contraindications.caution.map((c, i) => (
                        <li key={i} className="flex gap-1"><span>•</span><span>{c}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1 text-xs mt-1">
                  {result.contraindications.pregnancy && (
                    <div><span className="font-medium text-gray-600">妊娠中:</span> <span className="text-gray-800">{result.contraindications.pregnancy}</span></div>
                  )}
                  {result.contraindications.lactation && (
                    <div><span className="font-medium text-gray-600">授乳中:</span> <span className="text-gray-800">{result.contraindications.lactation}</span></div>
                  )}
                  {result.contraindications.pediatric && (
                    <div><span className="font-medium text-gray-600">小児:</span> <span className="text-gray-800">{result.contraindications.pediatric}</span></div>
                  )}
                  {result.contraindications.elderly && (
                    <div><span className="font-medium text-gray-600">高齢者:</span> <span className="text-gray-800">{result.contraindications.elderly}</span></div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mb-4">
              確信度: {result.confidence} | {result.model}
            </p>

            <div className="flex gap-2">
              {!result.isCorrect &&
                onApply &&
                result.corrections &&
                Object.keys(result.corrections).length > 0 && (
                  <button
                    onClick={() => {
                      onApply(result.corrections);
                      setShowResult(false);
                    }}
                    className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm hover:bg-teal-700"
                  >
                    修正を適用
                  </button>
                )}
              <button
                onClick={() => setShowResult(false)}
                className="flex-1 border rounded-lg py-2 text-sm hover:bg-gray-50"
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
