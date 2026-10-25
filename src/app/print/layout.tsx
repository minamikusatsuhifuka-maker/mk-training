"use client";

import Link from "next/link";

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="no-print p-4 bg-slate-100 flex items-center justify-between border-b">
        <Link href="/" className="text-sm text-teal hover:underline">← 元のページに戻る</Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          印刷する
        </button>
      </div>
      <div className="p-6 max-w-[210mm] mx-auto">
        {children}
      </div>
    </div>
  );
}
