"use client";

// リサーチ結果・学習資料の Markdown 描画ビュー
// ※ @tailwindcss/typography(prose) には依存せず、要素ごとに Tailwind クラスを割り当てる。
// ※ rehype-sanitize で XSS を防止（外部由来の Markdown を安全に表示）。
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

const components: Components = {
  h1: (props) => <h1 className="text-xl font-bold mt-4 mb-2 text-slate-800" {...props} />,
  h2: (props) => <h2 className="text-lg font-bold mt-4 mb-2 text-slate-800 border-b border-slate-200 pb-1" {...props} />,
  h3: (props) => <h3 className="text-base font-semibold mt-3 mb-1.5 text-slate-700" {...props} />,
  p: (props) => <p className="my-2 leading-relaxed text-slate-700" {...props} />,
  ul: (props) => <ul className="list-disc pl-6 my-2 space-y-1 text-slate-700" {...props} />,
  ol: (props) => <ol className="list-decimal pl-6 my-2 space-y-1 text-slate-700" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-slate-900" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  a: (props) => (
    <a className="text-sky-600 underline hover:text-sky-700" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  blockquote: (props) => (
    <blockquote className="border-l-4 border-slate-300 pl-3 my-2 text-slate-600 italic" {...props} />
  ),
  code: (props) => (
    <code className="bg-slate-100 text-slate-800 rounded px-1 py-0.5 text-[0.85em]" {...props} />
  ),
  pre: (props) => (
    <pre className="bg-slate-100 rounded-lg p-3 my-2 overflow-x-auto text-sm" {...props} />
  ),
  table: (props) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold" {...props} />,
  td: (props) => <td className="border border-slate-200 px-2 py-1" {...props} />,
  hr: (props) => <hr className="my-3 border-slate-200" {...props} />,
};

export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
