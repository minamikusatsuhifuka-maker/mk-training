// ディープリサーチ機能のストレージヘルパ（案A: インデックス＋本体分離）
//
// mk-training 流儀に合わせ、専用テーブルは作らず content_store（id 完全一致KV）を使う。
// content_store は前方一致検索ができないため、一覧用の軽量インデックスと
// 全文を持つ本体レコードを分離する（大量保存でも肥大化しない）。
//   - deep_research_index : { items: ResearchIndexItem[] } … 一覧用・軽量メタのみ
//   - deep_research:<id>  : ResearchResult … 本体（全文・sources）
// ※ Supabase は既存 lib/supabase.ts の anon クライアントを共有（service-role 不使用）。

import { supabase } from "@/lib/supabase";
import type { ResearchResult, ResearchSource } from "./types";

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
