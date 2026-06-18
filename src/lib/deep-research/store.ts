// ディープリサーチ機能のストレージヘルパ（案A: インデックス＋本体分離）
//
// mk-training 流儀に合わせ、専用テーブルは作らず content_store（id 完全一致KV）を使う。
// content_store は前方一致検索ができないため、一覧用の軽量インデックスと
// 全文を持つ本体レコードを分離する（大量保存でも肥大化しない）。
//   - deep_research_index : { items: ResearchIndexItem[] } … 一覧用・軽量メタのみ
//   - deep_research:<id>  : ResearchResult … 本体（全文・sources）
// ※ Supabase は既存 lib/supabase.ts の anon クライアントを共有（service-role 不使用）。

import { supabase } from "@/lib/supabase";
import { loadPortalItems, savePortalItems } from "@/lib/portal-store";
import {
  KNOWLEDGE_DOCS_KEY,
  type KnowledgeDoc,
  type KnowledgeDocCategory,
} from "@/lib/clinic-philosophy";
import {
  KNOWLEDGE_KEYS,
  type Manual,
  type OrgKnowledge,
} from "@/types/knowledge";
import type {
  ResearchResult,
  ResearchSource,
  DerivedMaterial,
  DerivedMaterialIndexItem,
  DerivedMaterialType,
} from "./types";

/** content_store.content_type（この機能の全レコード共通） */
const CONTENT_TYPE = "deep_research";
/** 一覧インデックスの id */
const RESEARCH_INDEX_KEY = "deep_research_index";
/** 本体レコードの id プレフィックス */
const RESEARCH_PREFIX = "deep_research:";

/** 一覧用の軽量メタ（全文を含まない） */
export type ResearchIndexItem = {
  id: string;
  topic: string;
  mode: string | null;
  model: string | null;
  createdAt: string;
};

/** インデックス（メタ配列）を取得 */
async function loadResearchIndex(): Promise<ResearchIndexItem[]> {
  const { data, error } = await supabase
    .from("content_store")
    .select("data")
    .eq("id", RESEARCH_INDEX_KEY)
    .single();
  if (error || !data) return [];
  const payload = data.data as { items?: ResearchIndexItem[] } | null;
  return Array.isArray(payload?.items) ? payload.items : [];
}

/** インデックスを保存 */
async function saveResearchIndex(items: ResearchIndexItem[]): Promise<void> {
  const { error } = await supabase.from("content_store").upsert({
    id: RESEARCH_INDEX_KEY,
    content_type: CONTENT_TYPE,
    data: { items } as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`インデックス保存に失敗: ${error.message}`);
}

/** 一覧取得（新しい順） */
export async function listResearch(): Promise<ResearchIndexItem[]> {
  const items = await loadResearchIndex();
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** 本体（全文）取得。見つからなければ null */
export async function getResearch(id: string): Promise<ResearchResult | null> {
  const { data, error } = await supabase
    .from("content_store")
    .select("data")
    .eq("id", RESEARCH_PREFIX + id)
    .single();
  if (error || !data) return null;
  return (data.data as ResearchResult) ?? null;
}

/** 保存（本体を upsert ＋ インデックスに追加）。保存した本体を返す */
export async function saveResearch(input: {
  topic: string;
  mode: string | null;
  model: string | null;
  content: string;
  sources: ResearchSource[];
}): Promise<ResearchResult> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const record: ResearchResult = {
    id,
    topic: input.topic,
    mode: input.mode,
    model: input.model,
    content: input.content,
    sources: input.sources,
    createdAt,
  };

  // 1) 本体を保存（全文はここだけに持たせる）
  const { error: bodyErr } = await supabase.from("content_store").upsert({
    id: RESEARCH_PREFIX + id,
    content_type: CONTENT_TYPE,
    data: record as unknown as Record<string, unknown>,
    updated_at: createdAt,
  });
  if (bodyErr) throw new Error(`本体保存に失敗: ${bodyErr.message}`);

  // 2) インデックスに軽量メタを先頭追加
  const indexItem: ResearchIndexItem = {
    id,
    topic: input.topic,
    mode: input.mode,
    model: input.model,
    createdAt,
  };
  const items = await loadResearchIndex();
  items.unshift(indexItem);
  await saveResearchIndex(items);

  return record;
}

/** 削除（インデックスから除外 ＋ 本体レコード削除） */
export async function deleteResearch(id: string): Promise<void> {
  const items = await loadResearchIndex();
  await saveResearchIndex(items.filter((it) => it.id !== id));
  const { error } = await supabase
    .from("content_store")
    .delete()
    .eq("id", RESEARCH_PREFIX + id);
  if (error) throw new Error(`本体削除に失敗: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
// STEP 3: 生成した学習資料（6タイプ）の保存・一覧・削除
//   リサーチ本体と同じ「案A: インデックス＋本体分離」方式で content_store に保存。
//     - derived_materials_index : { items: DerivedMaterialIndexItem[] } … 一覧用・軽量メタ
//     - derived_material:<id>    : DerivedMaterial … 本体（全文）
// ─────────────────────────────────────────────────────────────

/** content_store.content_type（学習資料レコード共通） */
const MATERIAL_CONTENT_TYPE = "deep_research_material";
/** 学習資料一覧インデックスの id */
const MATERIAL_INDEX_KEY = "derived_materials_index";
/** 学習資料本体レコードの id プレフィックス */
const MATERIAL_PREFIX = "derived_material:";

/** 学習資料インデックス（メタ配列）を取得 */
async function loadMaterialIndex(): Promise<DerivedMaterialIndexItem[]> {
  const { data, error } = await supabase
    .from("content_store")
    .select("data")
    .eq("id", MATERIAL_INDEX_KEY)
    .single();
  if (error || !data) return [];
  const payload = data.data as { items?: DerivedMaterialIndexItem[] } | null;
  return Array.isArray(payload?.items) ? payload.items : [];
}

/** 学習資料インデックスを保存 */
async function saveMaterialIndex(items: DerivedMaterialIndexItem[]): Promise<void> {
  const { error } = await supabase.from("content_store").upsert({
    id: MATERIAL_INDEX_KEY,
    content_type: MATERIAL_CONTENT_TYPE,
    data: { items } as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`学習資料インデックスの保存に失敗: ${error.message}`);
}

/** 学習資料の一覧取得（新しい順） */
export async function listDerivedMaterials(): Promise<DerivedMaterialIndexItem[]> {
  const items = await loadMaterialIndex();
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** 学習資料の本体（全文）取得。見つからなければ null */
export async function getDerivedMaterial(id: string): Promise<DerivedMaterial | null> {
  const { data, error } = await supabase
    .from("content_store")
    .select("data")
    .eq("id", MATERIAL_PREFIX + id)
    .single();
  if (error || !data) return null;
  return (data.data as DerivedMaterial) ?? null;
}

/** 学習資料を保存（本体を upsert ＋ インデックスに追加）。保存した本体を返す */
export async function saveDerivedMaterial(input: {
  title: string;
  type: DerivedMaterialType;
  content: string;
  sourceTopic: string;
  sourceResearchId?: string | null;
}): Promise<DerivedMaterial> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const record: DerivedMaterial = {
    id,
    title: input.title,
    type: input.type,
    content: input.content,
    sourceTopic: input.sourceTopic,
    sourceResearchId: input.sourceResearchId ?? null,
    createdAt,
  };

  // 1) 本体を保存（全文はここだけに持たせる）
  const { error: bodyErr } = await supabase.from("content_store").upsert({
    id: MATERIAL_PREFIX + id,
    content_type: MATERIAL_CONTENT_TYPE,
    data: record as unknown as Record<string, unknown>,
    updated_at: createdAt,
  });
  if (bodyErr) throw new Error(`学習資料の保存に失敗: ${bodyErr.message}`);

  // 2) インデックスに軽量メタを先頭追加
  const indexItem: DerivedMaterialIndexItem = {
    id,
    title: input.title,
    type: input.type,
    sourceResearchId: input.sourceResearchId ?? null,
    createdAt,
  };
  const items = await loadMaterialIndex();
  items.unshift(indexItem);
  await saveMaterialIndex(items);

  return record;
}

/** 学習資料を削除（インデックスから除外 ＋ 本体レコード削除） */
export async function deleteDerivedMaterial(id: string): Promise<void> {
  const items = await loadMaterialIndex();
  await saveMaterialIndex(items.filter((it) => it.id !== id));
  const { error } = await supabase
    .from("content_store")
    .delete()
    .eq("id", MATERIAL_PREFIX + id);
  if (error) throw new Error(`学習資料の削除に失敗: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
// STEP 2 拡張②: 既存知識システムへの保存連携
//   ※ 既存の保存形式に完全準拠（knowledge_docs は { docs }、org_* は portal-store の { items }）。
// ─────────────────────────────────────────────────────────────

/** ランダムID（既存 knowledge-system の genId 流儀に準拠） */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

/** AI参照資料（knowledge_docs）に1件追加 */
export async function addKnowledgeDoc(input: {
  title: string;
  category: KnowledgeDocCategory;
  content: string;
  fileType?: string;
}): Promise<KnowledgeDoc> {
  // 既存形式は { docs: KnowledgeDoc[] }（portal の { items } とは別形式）
  const { data } = await supabase
    .from("content_store")
    .select("data")
    .eq("id", KNOWLEDGE_DOCS_KEY)
    .single();
  const raw = (data?.data as { docs?: KnowledgeDoc[] } | undefined) || {};
  const docs = raw.docs || [];

  const now = new Date().toISOString();
  const doc: KnowledgeDoc = {
    id: genId("kd"),
    title: input.title,
    category: input.category,
    content: input.content,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    fileType: input.fileType,
    charCount: input.content.length,
  };
  docs.push(doc);

  const { error } = await supabase.from("content_store").upsert({
    id: KNOWLEDGE_DOCS_KEY,
    content_type: "knowledge_docs",
    data: { docs } as unknown as Record<string, unknown>,
    updated_at: now,
  });
  if (error) throw new Error(`AI参照資料の保存に失敗: ${error.message}`);
  return doc;
}

/** 組織ナレッジ（org_knowledges）に1件追加（承認待ち isApproved:false） */
export async function addOrgKnowledge(input: {
  title: string;
  situation: string;
  content: string;
  impact: string;
  actionItems: string[];
  tags: string[];
}): Promise<OrgKnowledge> {
  const items = await loadPortalItems<OrgKnowledge>(KNOWLEDGE_KEYS.knowledges, []);
  const knowledge: OrgKnowledge = {
    id: genId("kg"),
    type: "learning",
    title: input.title,
    situation: input.situation,
    content: input.content,
    impact: input.impact,
    actionItems: input.actionItems,
    tags: input.tags,
    author: "AI生成（ディープリサーチ）",
    isAnonymous: false,
    isApproved: false,
    createdAt: new Date().toISOString(),
  };
  const ok = await savePortalItems(KNOWLEDGE_KEYS.knowledges, [knowledge, ...items]);
  if (!ok) throw new Error("組織ナレッジの保存に失敗しました");
  return knowledge;
}

/** 院内マニュアル（org_manuals）に1件追加（下書き isPublished:false） */
export async function addManual(input: {
  title: string;
  purpose: string;
  category: string;
  steps: { order?: number; title: string; description: string; checkpoints?: string[]; tips?: string }[];
  todoItems: { text: string; timing?: string; priority?: string }[];
  cautions: string[];
  faq: { q: string; a: string }[];
}): Promise<Manual> {
  const items = await loadPortalItems<Manual>(KNOWLEDGE_KEYS.manuals, []);
  const now = new Date().toISOString();

  const manual: Manual = {
    id: genId("manual"),
    title: input.title,
    role: "all",
    category: input.category || "その他",
    purpose: input.purpose,
    steps: (input.steps || []).map((s, i) => ({
      id: genId("step"),
      order: s.order ?? i + 1,
      title: s.title ?? "",
      description: s.description ?? "",
      checkpoints: s.checkpoints ?? [],
      tips: s.tips,
    })),
    todoItems: (input.todoItems || []).map((t) => ({
      id: genId("todo"),
      text: t.text ?? "",
      timing: (["daily", "weekly", "monthly", "asneeded", "initial"].includes(t.timing || "")
        ? t.timing
        : "daily") as Manual["todoItems"][number]["timing"],
      priority: (["high", "normal", "optional"].includes(t.priority || "")
        ? t.priority
        : "normal") as Manual["todoItems"][number]["priority"],
    })),
    cautions: input.cautions || [],
    faq: input.faq || [],
    relatedManuals: [],
    isPublished: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const ok = await savePortalItems(KNOWLEDGE_KEYS.manuals, [manual, ...items]);
  if (!ok) throw new Error("マニュアルの保存に失敗しました");
  return manual;
}
