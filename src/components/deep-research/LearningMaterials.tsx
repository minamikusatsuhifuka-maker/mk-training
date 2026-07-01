"use client";

// 学習資料を作る（STEP 2: 6タイプ・複数選択・全選択・一括生成・結果表示・コピー）
// ※ リサーチ結果（topic + content）を元に Gemini 3.5 Flash で生成（grounding無し）。
// ※ 保存・公開・整理は STEP 3 以降で追加する。
import { useState } from "react";
import { MarkdownView } from "./MarkdownView";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type QuizQuestion = {
  q: string;
  choices: string[];
  answer_index: number;
  explanation: string;
};

type GenType =
  | "training"
  | "knowledge_basic"
  | "knowledge_expert"
  | "quiz"
  | "summary"
  | "essentials";

type RenderMode = "markdown" | "plain" | "quiz";

const GEN_TYPES: {
  key: GenType;
  label: string;
  endpoint: string;
  body?: Record<string, unknown>;
  render: RenderMode;
}[] = [
  { key: "training", label: "📋 研修資料", endpoint: "/api/admin/deep-research/training-doc", render: "markdown" },
  { key: "knowledge_basic", label: "🌱 知識シート（初心者）", endpoint: "/api/admin/deep-research/knowledge", body: { level: "basic" }, render: "markdown" },
  { key: "knowledge_expert", label: "🏆 知識シート（エキスパート）", endpoint: "/api/admin/deep-research/knowledge", body: { level: "expert" }, render: "markdown" },
  { key: "quiz", label: "❓ クイズ（4択10問）", endpoint: "/api/admin/deep-research/quiz", render: "quiz" },
  { key: "summary", label: "📌 要約", endpoint: "/api/admin/deep-research/summarize", render: "markdown" },
  { key: "essentials", label: "✨ 必須のまとめ", endpoint: "/api/admin/deep-research/essentials", render: "plain" },
];

type SlotResult = {
  text?: string; // markdown / plain
  questions?: QuizQuestion[]; // quiz
  error?: string;
};

/** クイズをコピー用テキストへ変換 */
function quizToText(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const lines = [`Q${i + 1}. ${q.q}`];
      q.choices.forEach((c, ci) => lines.push(`  ${String.fromCharCode(65 + ci)}. ${c}`));
      lines.push(`正解: ${String.fromCharCode(65 + q.answer_index)}. ${q.choices[q.answer_index] ?? ""}`);
      if (q.explanation) lines.push(`解説: ${q.explanation}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function LearningMaterials({
  topic,
  content,
  onSaved,
}: {
  topic: string;
  content: string;
  onSaved?: () => void;
}) {
  const [selected, setSelected] = useState<Record<GenType, boolean>>({
    training: false,
    knowledge_basic: false,
    knowledge_expert: false,
    quiz: false,
    summary: false,
    essentials: false,
  });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Partial<Record<GenType, SlotResult>>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 保存状態（タイプ別）: "saving" | "saved"
  const [saveState, setSaveState] = useState<Partial<Record<GenType, "saving" | "saved">>>({});

  const allSelected = GEN_TYPES.every((t) => selected[t.key]);
  const anySelected = GEN_TYPES.some((t) => selected[t.key]);

  const toggleAll = () => {
    const next = !allSelected;
    setSelected({
      training: next,
      knowledge_basic: next,
      knowledge_expert: next,
      quiz: next,
      summary: next,
      essentials: next,
    });
  };

  const toggleOne = (key: GenType) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 選択タイプを一括生成（並列）
  const generate = async () => {
    if (busy || !anySelected || !content.trim()) return;
    setBusy(true);

    const targets = GEN_TYPES.filter((t) => selected[t.key]);
    // 生成開始時に対象を「生成中」状態へ（既存結果はクリア）
    setResults((prev) => {
      const next = { ...prev };
      for (const t of targets) delete next[t.key];
      return next;
    });
    // 再生成するタイプは保存状態もリセット
    setSaveState((prev) => {
      const next = { ...prev };
      for (const t of targets) delete next[t.key];
      return next;
    });

    await Promise.allSettled(
      targets.map(async (t) => {
        try {
          const res = await fetch(t.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, content, ...(t.body || {}) }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "生成に失敗しました");

          const slot: SlotResult =
            t.render === "quiz"
              ? { questions: json.questions || [] }
              : { text: json.markdown || "" };
          setResults((prev) => ({ ...prev, [t.key]: slot }));
        } catch (e) {
          setResults((prev) => ({
            ...prev,
            [t.key]: { error: e instanceof Error ? e.message : "生成に失敗しました" },
          }));
        }
      })
    );

    setBusy(false);
  };

  // 保存（生成した学習資料を content_store に保存）
  const saveMaterial = async (key: GenType, text: string) => {
    if (!text.trim() || saveState[key] === "saving") return;
    const meta = GEN_TYPES.find((t) => t.key === key);
    setSaveState((prev) => ({ ...prev, [key]: "saving" }));
    try {
      const res = await fetch("/api/admin/deep-research/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${meta?.label ?? "学習資料"}：${topic}`,
          type: key,
          content: text,
          sourceTopic: topic,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存に失敗しました");
      setSaveState((prev) => ({ ...prev, [key]: "saved" }));
      onSaved?.();
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [key]: { ...(prev[key] || {}), error: e instanceof Error ? e.message : "保存に失敗しました" },
      }));
      setSaveState((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // コピー
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // クリップボード不可環境は無視
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700">📚 学習資料を作る</h3>
        <button type="button" onClick={toggleAll} className="text-xs text-sky-600 hover:underline">
          {allSelected ? "全選択を解除" : "全選択"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {GEN_TYPES.map((t) => (
          <label
            key={t.key}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50"
          >
            <Checkbox
              checked={selected[t.key]}
              onCheckedChange={() => toggleOne(t.key)}
              disabled={busy}
            />
            <span className="text-sm text-slate-700">{t.label}</span>
          </label>
        ))}
      </div>

      <Button onClick={generate} disabled={busy || !anySelected}>
        {busy ? "生成中…" : "✨ 選択した資料を一括生成"}
      </Button>

      {/* 生成結果 */}
      <div className="space-y-3">
        {GEN_TYPES.filter((t) => results[t.key]).map((t) => {
          const slot = results[t.key]!;
          const copyText =
            t.render === "quiz" ? quizToText(slot.questions || []) : slot.text || "";
          return (
            <div key={t.key} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">{t.label}</h4>
                {!slot.error && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => saveMaterial(t.key, copyText)}
                      disabled={saveState[t.key] === "saving" || saveState[t.key] === "saved"}
                    >
                      {saveState[t.key] === "saving"
                        ? "保存中…"
                        : saveState[t.key] === "saved"
                        ? "✓ 保存済"
                        : "💾 保存"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copy(t.key, copyText)}>
                      {copiedKey === t.key ? "✓ コピー済" : "📋 コピー"}
                    </Button>
                  </div>
                )}
              </div>

              {slot.error ? (
                <p className="text-sm text-red-600">{slot.error}</p>
              ) : t.render === "markdown" ? (
                <MarkdownView>{slot.text || ""}</MarkdownView>
              ) : t.render === "plain" ? (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                  {slot.text || ""}
                </pre>
              ) : (
                <ol className="space-y-3 list-decimal pl-5">
                  {(slot.questions || []).map((q, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      <div className="font-medium text-slate-800">{q.q}</div>
                      <ul className="mt-1 space-y-0.5">
                        {q.choices.map((c, ci) => (
                          <li
                            key={ci}
                            className={
                              ci === q.answer_index
                                ? "text-emerald-700 font-medium"
                                : "text-slate-600"
                            }
                          >
                            {String.fromCharCode(65 + ci)}. {c}
                            {ci === q.answer_index ? " ✓" : ""}
                          </li>
                        ))}
                      </ul>
                      {q.explanation && (
                        <div className="mt-1 text-xs text-slate-600">解説: {q.explanation}</div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
