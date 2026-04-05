"use client";

import { useState, type ReactNode } from "react";

type ContraindicationInfo = {
  absolute?: string[];
  caution?: string[];
  pregnancy?: string;
  lactation?: string;
  pediatric?: string;
  elderly?: string;
};

type BatchResultItem = {
  id: string;
  name: string;
  isCorrect: boolean;
  severity: "none" | "low" | "medium" | "high";
  issues: string[];
  newKnowledge: string[];
  corrections: Record<string, string>;
  contraindications?: ContraindicationInfo;
  evidenceSource?: string;
  confidence: string;
};

type BatchResult = {
  summary: string;
  totalItems: number;
  issuesFound: number;
  results: BatchResultItem[];
  model: string;
};

type SelectedItem = {
  id: string;
  name: string;
  data: Record<string, unknown>;
};

type Props = {
  contentType: string;
  selectedItems: SelectedItem[];
  onClear: () => void;
  onApplyChanges?: (changes: Record<string, Record<string, string>>) => Promise<void>;
  /** バナーに追加するカスタムアクション（一括優先度変更等） */
  extraActions?: ReactNode;
};

type ApprovalState = Record<string, Record<string, boolean>>;

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

export function GeminiBatchVerify({
  contentType,
  selectedItems,
  onClear,
  onApplyChanges,
  extraActions,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalState>({});
  const [applied, setApplied] = useState<Set<string>>(new Set());

  if (selectedItems.length === 0) return null;

  const handleBatchVerify = async () => {
    setLoading(true);
    setApprovals({});
    setApplied(new Set());
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

  // 承認トグル
  const toggleApproval = (itemId: string, field: string) => {
    setApprovals((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [field]: !(prev[itemId]?.[field]) },
    }));
  };

  // 全項目を承認
  const approveAll = (itemId: string, corrections: Record<string, string>) => {
    setApprovals((prev) => ({
      ...prev,
      [itemId]: Object.fromEntries(Object.keys(corrections).map((k) => [k, true])),
    }));
  };

  // 承認済み修正を適用
  const applyApprovedChanges = async () => {
    if (!onApplyChanges) return;
    const changes: Record<string, Record<string, string>> = {};

    for (const [itemId, fields] of Object.entries(approvals)) {
      const item = result?.results.find((r) => r.id === itemId);
      if (!item?.corrections) continue;
      changes[itemId] = {};
      for (const [field, isApproved] of Object.entries(fields)) {
        if (isApproved && item.corrections[field]) {
          changes[itemId][field] = item.corrections[field];
        }
      }
      if (Object.keys(changes[itemId]).length === 0) delete changes[itemId];
    }

    if (Object.keys(changes).length === 0) return;
    await onApplyChanges(changes);
    setApplied(new Set(Object.keys(changes)));
    alert("承認した変更を適用しました");
  };

  const totalApprovals = Object.values(approvals).reduce(
    (sum, fields) => sum + Object.values(fields).filter(Boolean).length,
    0
  );

  return (
    <>
      {/* 選択中バナー（固定フッター） */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white px-4 py-3 z-40 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium">{selectedItems.length}件選択中</span>
          <div className="flex items-center gap-2 flex-wrap">
            {extraActions}
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
                    applied.has(item.id)
                      ? "border-green-300 bg-green-50/30"
                      : item.severity !== "none"
                        ? "border-orange-200"
                        : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">
                      {item.name}
                      {applied.has(item.id) && (
                        <span className="ml-2 text-xs text-green-600">適用済み</span>
                      )}
                    </span>
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

                  {/* 禁忌・使用上の注意 */}
                  {item.contraindications && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-bold text-red-700 mb-2">🚫 禁忌・使用上の注意:</p>

                      {item.contraindications.absolute && item.contraindications.absolute.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-red-600">絶対禁忌:</p>
                          <ul className="text-xs text-red-800 space-y-0.5">
                            {item.contraindications.absolute.map((c, i) => (
                              <li key={i} className="flex gap-1"><span>•</span><span>{c}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {item.contraindications.caution && item.contraindications.caution.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-orange-600">慎重投与:</p>
                          <ul className="text-xs text-orange-800 space-y-0.5">
                            {item.contraindications.caution.map((c, i) => (
                              <li key={i} className="flex gap-1"><span>•</span><span>{c}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-1 text-xs mt-1">
                        {item.contraindications.pregnancy && (
                          <div><span className="font-medium text-gray-600">妊娠中:</span> <span className="text-gray-800">{item.contraindications.pregnancy}</span></div>
                        )}
                        {item.contraindications.lactation && (
                          <div><span className="font-medium text-gray-600">授乳中:</span> <span className="text-gray-800">{item.contraindications.lactation}</span></div>
                        )}
                        {item.contraindications.pediatric && (
                          <div><span className="font-medium text-gray-600">小児:</span> <span className="text-gray-800">{item.contraindications.pediatric}</span></div>
                        )}
                        {item.contraindications.elderly && (
                          <div><span className="font-medium text-gray-600">高齢者:</span> <span className="text-gray-800">{item.contraindications.elderly}</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Before/After 修正案（承認UI） */}
                  {item.corrections && Object.keys(item.corrections).length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-teal-700">
                          ✏️ 修正案（承認すると自動反映）:
                        </p>
                        <button
                          type="button"
                          onClick={() => approveAll(item.id, item.corrections)}
                          className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded hover:bg-teal-200"
                        >
                          全て承認
                        </button>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(item.corrections).map(([field, newValue]) => {
                          const isFieldApproved = approvals[item.id]?.[field];
                          const currentValue = selectedItems.find(
                            (si) => si.id === item.id
                          )?.data?.[field];

                          return (
                            <div
                              key={field}
                              className={`rounded-lg p-2 border ${
                                isFieldApproved
                                  ? "border-teal-300 bg-teal-50"
                                  : "border-gray-200 bg-gray-50"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-600">
                                  {field}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleApproval(item.id, field)}
                                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                                    isFieldApproved
                                      ? "bg-teal-600 text-white hover:bg-teal-700"
                                      : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                                  }`}
                                >
                                  {isFieldApproved ? "✅ 承認済み" : "承認する"}
                                </button>
                              </div>

                              {/* Before */}
                              {currentValue != null && (
                                <div className="mb-1">
                                  <span className="text-xs text-red-500 font-medium">
                                    Before:{" "}
                                  </span>
                                  <span className="text-xs text-red-700 line-through">
                                    {String(currentValue).slice(0, 100)}
                                  </span>
                                </div>
                              )}

                              {/* After */}
                              <div>
                                <span className="text-xs text-green-600 font-medium">
                                  After:{" "}
                                </span>
                                <span className="text-xs text-green-800">
                                  {String(newValue).slice(0, 150)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {item.evidenceSource && (
                    <div className="mt-2 text-xs text-gray-500 flex items-start gap-1">
                      <span>📚</span>
                      <span>参照: {item.evidenceSource}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">確信度: {item.confidence}</p>
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="p-4 border-t space-y-2">
              {totalApprovals > 0 && onApplyChanges && (
                <button
                  type="button"
                  onClick={applyApprovedChanges}
                  className="w-full bg-teal-600 text-white rounded-lg py-2 text-sm hover:bg-teal-700 font-medium"
                >
                  ✅ {totalApprovals}件の修正を適用する
                </button>
              )}
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
