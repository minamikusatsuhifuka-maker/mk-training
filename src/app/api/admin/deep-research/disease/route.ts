/**
 * 疾患ディープリサーチ → 各形式への変換・保存 API
 *  入力: { diseaseName, diseaseEnglishName, currentData, perspective, targets[] }
 *  処理:
 *   1) 検索Grounding付きで疾患リサーチを実行（gemini-3.5-flash）
 *   2) targets に応じて変換・保存
 *      - 'material'       : derived_materials に disease_research タイプで保存
 *      - 'org_knowledge'  : OrgKnowledge へ変換 → org_knowledges（isApproved:false）
 *      - 'manual'         : Manual へ変換 → org_manuals（isPublished:false）
 *      - 'disease_update' : 疾患データ更新案（description/cause/treatment/keyPoints）を返す（保存はフロントで確認後）
 *  ※ 一括処理は呼び出し側が1件ずつ順次呼ぶ前提。
 */
import { NextResponse } from "next/server";
import {
  researchWithSearch,
  generateText,
  parseJsonLoose,
} from "@/lib/deep-research/gemini-research";
import {
  getDiseaseResearchPrompt,
  getDiseaseUpdatePrompt,
  getToOrgKnowledgePrompt,
  getToManualPrompt,
  type DiseaseResearchContext,
} from "@/lib/deep-research/prompts";
import {
  saveDerivedMaterial,
  addOrgKnowledge,
  addManual,
} from "@/lib/deep-research/store";
import type { ResearchPerspective } from "@/lib/deep-research/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Target = "material" | "org_knowledge" | "manual" | "disease_update";

type ParsedKnowledge = {
  title?: string;
  situation?: string;
  content?: string;
  impact?: string;
  actionItems?: string[];
  tags?: string[];
};

type ParsedManual = {
  title?: string;
  purpose?: string;
  category?: string;
  steps?: { order?: number; title?: string; description?: string; checkpoints?: string[]; tips?: string }[];
  todoItems?: { text?: string; timing?: string; priority?: string }[];
  cautions?: string[];
  faq?: { q?: string; a?: string }[];
};

type DiseaseUpdate = {
  description?: string;
  cause?: string;
  treatment?: string;
  keyPoints?: string[];
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const diseaseName: string = body.diseaseName || "";
    const diseaseEnglishName: string = body.diseaseEnglishName || "";
    const currentData: DiseaseResearchContext = body.currentData || {};
    const perspective: ResearchPerspective = body.perspective || "training";
    const targets: Target[] = Array.isArray(body.targets) ? body.targets : [];

    if (!diseaseName) {
      return NextResponse.json(
        { error: "diseaseName が必要です" },
        { status: 400 }
      );
    }
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "保存先（targets）が1つ以上必要です" },
        { status: 400 }
      );
    }

    // 1) 疾患リサーチ（検索Grounding）
    const researchPrompt = getDiseaseResearchPrompt(
      diseaseName,
      diseaseEnglishName,
      currentData,
      perspective
    );
    const { content: researchText, sources } = await researchWithSearch(researchPrompt);

    const results: {
      material?: { id: string };
      orgKnowledge?: { id: string };
      manual?: { id: string };
      errors: Record<string, string>;
    } = { errors: {} };
    let diseaseUpdate: DiseaseUpdate | undefined;

    // 2) targets ごとに変換・保存（1つ失敗しても他は続行）
    // 2-a) 学習資料として保存
    if (targets.includes("material")) {
      try {
        const saved = await saveDerivedMaterial({
          title: `【疾患研修】${diseaseName}`,
          type: "disease_research",
          content: researchText,
          sourceTopic: diseaseName,
        });
        results.material = { id: saved.id };
      } catch (e) {
        results.errors.material = e instanceof Error ? e.message : "保存に失敗しました";
      }
    }

    // 2-b) 組織ナレッジへ変換
    if (targets.includes("org_knowledge")) {
      try {
        const raw = await generateText(getToOrgKnowledgePrompt(diseaseName, researchText), { temperature: 0.3 });
        const parsed = parseJsonLoose<ParsedKnowledge>(raw);
        if (!parsed) throw new Error("ナレッジJSONの解析に失敗しました");
        const saved = await addOrgKnowledge({
          title: parsed.title || diseaseName,
          situation: parsed.situation || "",
          content: parsed.content || "",
          impact: parsed.impact || "",
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 5) : [],
          tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
        });
        results.orgKnowledge = { id: saved.id };
      } catch (e) {
        results.errors.org_knowledge = e instanceof Error ? e.message : "変換に失敗しました";
      }
    }

    // 2-c) マニュアルへ変換
    if (targets.includes("manual")) {
      try {
        const raw = await generateText(getToManualPrompt(diseaseName, researchText), { temperature: 0.3 });
        const parsed = parseJsonLoose<ParsedManual>(raw);
        if (!parsed) throw new Error("マニュアルJSONの解析に失敗しました");
        const saved = await addManual({
          title: parsed.title || diseaseName,
          purpose: parsed.purpose || "",
          category: parsed.category || "その他",
          steps: (parsed.steps || []).slice(0, 5).map((s) => ({
            order: s.order,
            title: s.title ?? "",
            description: s.description ?? "",
            checkpoints: Array.isArray(s.checkpoints) ? s.checkpoints : [],
            tips: s.tips,
          })),
          todoItems: (parsed.todoItems || []).map((t) => ({
            text: t.text ?? "",
            timing: t.timing,
            priority: t.priority,
          })),
          cautions: Array.isArray(parsed.cautions) ? parsed.cautions.slice(0, 4) : [],
          faq: (parsed.faq || []).slice(0, 3).map((f) => ({ q: f.q ?? "", a: f.a ?? "" })),
        });
        results.manual = { id: saved.id };
      } catch (e) {
        results.errors.manual = e instanceof Error ? e.message : "変換に失敗しました";
      }
    }

    // 2-d) 疾患データ更新案を生成（保存はフロントで確認後）
    if (targets.includes("disease_update")) {
      try {
        const raw = await generateText(getDiseaseUpdatePrompt(diseaseName, currentData, researchText), { temperature: 0.3 });
        const parsed = parseJsonLoose<DiseaseUpdate>(raw);
        if (!parsed) throw new Error("疾患更新案JSONの解析に失敗しました");
        diseaseUpdate = {
          description: parsed.description,
          cause: parsed.cause,
          treatment: parsed.treatment,
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter(Boolean) : undefined,
        };
      } catch (e) {
        results.errors.disease_update = e instanceof Error ? e.message : "更新案の生成に失敗しました";
      }
    }

    return NextResponse.json({
      research: { content: researchText, sources },
      results,
      diseaseUpdate,
    });
  } catch (e) {
    console.error("[deep-research/disease] error:", e);
    const message = e instanceof Error ? e.message : "疾患リサーチに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
