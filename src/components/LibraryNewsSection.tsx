"use client";

// ホーム「📚 資料庫の新着・更新」セクション（指示書97-H）
// - 既存の portal_library（content_store）から直近の登録/更新を最大5件表示（新規データは作らない）。
// - content_store は anon 読み取り可のため、他ホームセクション（gantt/metrics）と同じ anon 直読み。
// - 更新待ちがあれば「🔄 承認待ち ◯件」を1行表示。0件ならセクションごと非表示（null）。
// - 誰が=最新版の承認者(replacedBy) or 登録者(uploadedByName)、いつ=updatedAt。名前は保存済み表示名。

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPortalObject } from "@/lib/portal-store";
import {
  LIBRARY_KEY,
  normalizeStore,
  docVersionNumber,
  opensInBrowser,
  docDisplayMeta,
  type LibraryDoc,
} from "@/lib/library";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// リンク型は linkUrl、PDFは新規タブ、他ファイルは ?download（101でリンク型対応）
function fileHref(d: LibraryDoc): string {
  if (d.kind === "link") return d.linkUrl;
  if (opensInBrowser(d.mimeType, d.fileName)) return d.fileUrl;
  const sep = d.fileUrl.includes("?") ? "&" : "?";
  return `${d.fileUrl}${sep}download=${encodeURIComponent(d.fileName || "download")}`;
}

// 誰が最後に触れたか（更新があれば最新版の承認者、なければ登録者）
function lastActor(d: LibraryDoc): string {
  if (d.versions.length > 0) {
    const v = d.versions[d.versions.length - 1];
    if (v.replacedBy) return v.replacedBy;
  }
  return d.uploadedByName || "";
}

export function LibraryNewsSection() {
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);

  useEffect(() => {
    loadPortalObject<unknown>(LIBRARY_KEY, null)
      .then((raw) => setDocs(normalizeStore(raw).docs))
      .catch(() => setDocs([]));
  }, []);

  if (!docs || docs.length === 0) return null;

  const recent = [...docs]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 5);
  const pendingCount = docs.filter((d) => d.pendingUpdate).length;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          📚 資料庫の新着・更新
        </h2>
        <Link href="/library" className="text-xs text-teal-600 hover:underline">
          資料庫へ →
        </Link>
      </div>

      {pendingCount > 0 && (
        <Link
          href="/library"
          className="block mb-2 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-1.5 hover:bg-cyan-100"
        >
          🔄 承認待ち {pendingCount} 件（クリックで確認）
        </Link>
      )}

      <ul className="space-y-1.5">
        {recent.map((d) => {
          const meta = docDisplayMeta(d);
          const vN = docVersionNumber(d);
          const openInTab =
            d.kind === "link" || opensInBrowser(d.mimeType, d.fileName);
          const actor = lastActor(d);
          return (
            <li
              key={d.id}
              className="flex items-center gap-2 text-sm bg-white border border-gray-100 rounded-xl px-3 py-2 flex-wrap"
            >
              <span className="shrink-0">{meta.icon}</span>
              <span className="font-medium flex-1 min-w-0 break-words">
                {d.title}
              </span>
              <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 shrink-0">
                {d.category}
              </span>
              {vN > 1 && (
                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 shrink-0">
                  v{vN}
                </span>
              )}
              <span className="text-[11px] text-gray-400 shrink-0">
                {actor ? `${actor}・` : ""}
                {formatDate(d.updatedAt)}
              </span>
              <a
                href={fileHref(d)}
                target={openInTab ? "_blank" : undefined}
                rel="noreferrer"
                className="text-xs text-teal-600 hover:underline shrink-0"
              >
                {openInTab ? "開く" : "DL"}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
