"use client";

// STEP 2 拡張②③: リサーチ結果 → 既存知識システム連携 ＋ 学習資料変換
//   ② 知識ベース保存（AI参照資料 / 組織ナレッジ / マニュアル）
//   ③ 学習資料変換（クイズ生成→クイズDB追加 / 患者説明書→印刷）
// ※ Toaster 未マウントのため、フィードバックはインラインのステータス表示で行う。
import { useState } from "react";
import { MarkdownView } from "./MarkdownView";
import { Button } from "@/components/ui/button";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { quizQuestions as initialQuiz, type QuizQuestion, type QuizCategory } from "@/data/quiz";
import type { ResearchPerspective } from "@/lib/deep-research/types";

type GeneratedQuiz = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
};

/** quiz-generator のカテゴリ文字列 → QuizCategory（既存 quiz-generator/page と同等） */
function mapCategory(raw: string): QuizCategory {
  const lower = (raw || "").toLowerCase();
  if (raw.includes("疾患") || lower.includes("disease")) return "disease";
  if (raw.includes("薬") || lower.includes("drug")) return "drug";
  if (raw.includes("美容") || lower.includes("cosmetic") || raw.includes("施術")) return "cosmetic";
  if (raw.includes("業務") || raw.includes("接遇") || lower.includes("ops")) return "ops";
  return "disease";
}

export function ResearchActions({
  topic,
  content,
  perspective,
}: {
  topic: string;
  content: string;
  perspective: ResearchPerspective;
}) {
  // ② 知識ベース連携
  const [kbBusy, setKbBusy] = useState<"docs" | "org" | "manual" | null>(null);
  const [kbMsg, setKbMsg] = useState("");
  const [kbErr, setKbErr] = useState("");

  // ③ クイズ
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizzes, setQuizzes] = useState<GeneratedQuiz[] | null>(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizMsg, setQuizMsg] = useState("");
  const [quizErr, setQuizErr] = useState("");

  // ③ 患者説明書
  const [psBusy, setPsBusy] = useState(false);
  const [psMarkdown, setPsMarkdown] = useState<string | null>(null);
  const [psErr, setPsErr] = useState("");

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "処理に失敗しました");
    return json;
  };

  // ── ② 知識ベース連携 ──
  const addToKnowledgeDocs = async () => {
    setKbBusy("docs");
    setKbMsg("");
    setKbErr("");
    try {
      await post("/api/admin/deep-research/to-knowledge-docs", { topic, content, perspective });
      setKbMsg("✅ AI参照資料に追加しました。AIチャット等で参照されます。");
    } catch (e) {
      setKbErr(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setKbBusy(null);
    }
  };

  const addToOrgKnowledge = async () => {
    setKbBusy("org");
    setKbMsg("");
    setKbErr("");
    try {
      await post("/api/admin/deep-research/to-knowledge", { topic, content });
      setKbMsg("✅ 組織ナレッジに追加しました（承認待ち）。知識ベース管理で確認できます。");
    } catch (e) {
      setKbErr(e instanceof Error ? e.message : "変換に失敗しました");
    } finally {
      setKbBusy(null);
    }
  };

  const convertToManual = async () => {
    setKbBusy("manual");
    setKbMsg("");
    setKbErr("");
    try {
      await post("/api/admin/deep-research/to-manual", { topic, content });
      setKbMsg("✅ マニュアル（下書き）に変換しました。知識ベース管理で編集・公開できます。");
    } catch (e) {
      setKbErr(e instanceof Error ? e.message : "変換に失敗しました");
    } finally {
      setKbBusy(null);
    }
  };

  // ── ③ クイズ生成 ──
  const generateQuiz = async () => {
    setQuizBusy(true);
    setQuizErr("");
    setQuizMsg("");
    setQuizzes(null);
    try {
      const json = await post("/api/quiz-generator", { content, count: 10 });
      setQuizzes(Array.isArray(json.quizzes) ? json.quizzes : []);
    } catch (e) {
      setQuizErr(e instanceof Error ? e.message : "クイズ生成に失敗しました");
    } finally {
      setQuizBusy(false);
    }
  };

  const saveQuizToDb = async () => {
    if (!quizzes || quizzes.length === 0) return;
    setQuizSaving(true);
    setQuizErr("");
    setQuizMsg("");
    try {
      const existing = await getContent<QuizQuestion>(CONTENT_KEYS.quiz, initialQuiz);
      const ts = Date.now();
      const newQuestions: QuizQuestion[] = quizzes.map((g, i) => ({
        id: `qg_${ts}_${i}`,
        category: mapCategory(g.category),
        question: g.question,
        options: g.options,
        answerIndex: g.correct,
        explanation: g.explanation,
      }));
      const ok = await saveContent(CONTENT_KEYS.quiz, [...existing, ...newQuestions]);
      if (!ok) throw new Error("クイズDBへの保存に失敗しました");
      setQuizMsg(`✅ クイズ ${newQuestions.length} 問をクイズDBに追加しました。`);
    } catch (e) {
      setQuizErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setQuizSaving(false);
    }
  };

  // ── ③ 患者説明書 ──
  const generatePatientSheet = async () => {
    setPsBusy(true);
    setPsErr("");
    setPsMarkdown(null);
    try {
      const json = await post("/api/patient-sheet", { topic, content });
      setPsMarkdown(json.markdown || "");
    } catch (e) {
      setPsErr(e instanceof Error ? e.message : "患者説明書の生成に失敗しました");
    } finally {
      setPsBusy(false);
    }
  };

  const printSheet = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="space-y-5">
      {/* ② 知識ベースに追加 */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">🗂 知識ベースに追加</h3>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={addToKnowledgeDocs} disabled={kbBusy !== null}>
            {kbBusy === "docs" ? "追加中…" : "📚 AI参照資料に追加"}
          </Button>
          <Button variant="outline" onClick={addToOrgKnowledge} disabled={kbBusy !== null}>
            {kbBusy === "org" ? "変換中…" : "🚀 組織ナレッジに追加"}
          </Button>
          <Button variant="outline" onClick={convertToManual} disabled={kbBusy !== null}>
            {kbBusy === "manual" ? "変換中…" : "📖 マニュアルに変換"}
          </Button>
        </div>
        {kbMsg && <p className="text-sm text-emerald-700">{kbMsg}</p>}
        {kbErr && <p className="text-sm text-red-600">{kbErr}</p>}
      </div>

      {/* ③ 学習資料を作る（クイズ・患者説明書） */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">📝 学習資料へ変換</h3>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={generateQuiz} disabled={quizBusy}>
            {quizBusy ? "生成中…" : "📝 このリサーチからクイズを生成"}
          </Button>
          <Button variant="outline" onClick={generatePatientSheet} disabled={psBusy}>
            {psBusy ? "生成中…" : "📄 患者説明書を生成"}
          </Button>
        </div>
        {quizErr && <p className="text-sm text-red-600">{quizErr}</p>}
        {quizMsg && <p className="text-sm text-emerald-700">{quizMsg}</p>}

        {/* クイズプレビュー */}
        {quizzes && quizzes.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                生成クイズ（{quizzes.length}問）プレビュー
              </span>
              <Button size="sm" onClick={saveQuizToDb} disabled={quizSaving}>
                {quizSaving ? "保存中…" : "＋ クイズDBに追加"}
              </Button>
            </div>
            <ol className="space-y-3 list-decimal pl-5">
              {quizzes.map((q, i) => (
                <li key={i} className="text-sm text-slate-700">
                  <div className="font-medium text-slate-800">{q.question}</div>
                  <ul className="mt-1 space-y-0.5">
                    {q.options.map((o, oi) => (
                      <li
                        key={oi}
                        className={oi === q.correct ? "text-emerald-700 font-medium" : "text-slate-600"}
                      >
                        {String.fromCharCode(65 + oi)}. {o}
                        {oi === q.correct ? " ✓" : ""}
                      </li>
                    ))}
                  </ul>
                  {q.explanation && <div className="mt-1 text-xs text-slate-500">解説: {q.explanation}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 患者説明書プレビュー */}
        {psErr && <p className="text-sm text-red-600">{psErr}</p>}
        {psMarkdown && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">患者説明書プレビュー</span>
              <Button size="sm" variant="outline" onClick={printSheet}>
                🖨 印刷
              </Button>
            </div>
            <div className="patient-sheet-print">
              <MarkdownView>{psMarkdown}</MarkdownView>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
