"use client";

// 📚 資料庫（指示書86＋87）
// 説明資料・同意書（PDF/Word/PPT）をAI自動分類つきで登録・検索・共有する。
// 登録＝即公開（承認なし）。編集・削除・復元はログインユーザー全員が可能で、変更履歴に残る。
// データは content_store（portal_library / portal_library_log）、ファイルは Supabase Storage。

import { PageHeader } from "@/components/PageHeader";
import LibraryBrowser from "@/components/LibraryBrowser";

export default function LibraryPage() {
  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <PageHeader
        title="📚 資料庫"
        description="説明資料・同意書を登録すると、AIが内容を読んでカテゴリ・キーワード・要約を付けます。検索とカテゴリで探せます。"
      />
      <LibraryBrowser />
    </div>
  );
}
