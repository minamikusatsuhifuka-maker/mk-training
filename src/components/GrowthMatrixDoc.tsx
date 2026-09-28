"use client";
// 確定版 v1.0 の本文をそのまま表示（指示書190 A）
//   一次ソース src/data/growth-matrix-v1.json の md を**一字一句変えずに**描画する。
//   第2節の概念図（``` の図）は SVG（GrowthMatrixFigure）で描き直し、原文の図は「原文の図」として折りたたみで残す。

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GROWTH_MATRIX_V1_MD } from "@/lib/growth-matrix";
import { GrowthMatrixFigure } from "@/components/GrowthMatrixFigure";

type Piece = { kind: "md"; text: string } | { kind: "fence"; text: string };

/** ``` … ``` を切り出す（それ以外は md のまま） */
export function splitFences(md: string): Piece[] {
  const out: Piece[] = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push({ kind: "md", text: md.slice(last, m.index) });
    out.push({ kind: "fence", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push({ kind: "md", text: md.slice(last) });
  return out;
}

const components = {
  h1: (p: React.ComponentProps<"h1">) => <h1 className="text-lg font-bold text-gray-900 mt-2" {...p} />,
  h2: (p: React.ComponentProps<"h2">) => <h2 className="text-base font-bold text-gray-900 mt-6 pt-3 border-t border-gray-200" {...p} />,
  h3: (p: React.ComponentProps<"h3">) => <h3 className="text-sm font-bold text-gray-900 mt-4" {...p} />,
  p: (p: React.ComponentProps<"p">) => <p className="text-[13px] text-gray-800 leading-relaxed" {...p} />,
  ul: (p: React.ComponentProps<"ul">) => <ul className="list-disc pl-5 text-[13px] text-gray-800 space-y-1" {...p} />,
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  hr: () => <hr className="border-gray-200 my-4" />,
  table: (p: React.ComponentProps<"table">) => (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-[12px] border border-gray-200 bg-white" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left align-top text-gray-700 whitespace-nowrap" {...p} />,
  td: (p: React.ComponentProps<"td">) => <td className="border border-gray-200 px-2 py-1 align-top text-gray-800 leading-relaxed" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => <strong className="font-bold text-gray-900" {...p} />,
};

export function GrowthMatrixDoc() {
  const pieces = splitFences(GROWTH_MATRIX_V1_MD);
  return (
    <article className="space-y-2" data-growth-matrix-doc>
      {pieces.map((p, i) =>
        p.kind === "md" ? (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {p.text}
          </ReactMarkdown>
        ) : (
          <div key={i} className="space-y-1" data-matrix-figure-slot>
            <GrowthMatrixFigure />
            <details className="text-[11px] text-gray-600">
              <summary className="cursor-pointer">原文の図（テキスト）</summary>
              <pre className="overflow-x-auto text-[11px] leading-tight bg-gray-50 border border-gray-200 rounded p-2 mt-1">{p.text}</pre>
            </details>
          </div>
        )
      )}
    </article>
  );
}
