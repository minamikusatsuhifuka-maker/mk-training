// AI APIから呼び出されるサーバー側の知識ベース取得ヘルパー
import { createClient } from "@supabase/supabase-js";
import {
  buildPhilosophyContext,
  KNOWLEDGE_DOCS_KEY,
  type KnowledgeDoc,
} from "./clinic-philosophy";

// Supabaseの追加ドキュメント（アクティブなもの）を取得し、
// 理念コンテキスト + 追加ドキュメントの形に整形して返す
export async function buildFullKnowledgeContext(): Promise<string> {
  const philosophy = buildPhilosophyContext();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return philosophy;

  let additionalKnowledge = "";
  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", KNOWLEDGE_DOCS_KEY)
      .single();

    const raw = (data?.data as { docs?: KnowledgeDoc[] } | undefined) || {};
    const docs: KnowledgeDoc[] = raw.docs || [];
    const activeDocs = docs.filter((d) => d.isActive);

    if (activeDocs.length > 0) {
      additionalKnowledge =
        "\n\n## 【追加の知識ベース】\n" +
        activeDocs
          .map((d) => `### ${d.title}\n${d.content}`)
          .join("\n\n---\n\n");
    }
  } catch {
    // 取得失敗時は理念のみで継続
  }

  return philosophy + additionalKnowledge;
}
