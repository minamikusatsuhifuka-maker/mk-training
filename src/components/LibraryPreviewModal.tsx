"use client";

// 資料のブラウザ内プレビュー（指示書100＋101）
// - 外部Officeビューア（Microsoft/Google等）にファイルURLを渡さない。すべてブラウザ内で完結する
//   （院内の同意書・運用資料を外部サービスに送らないための確定仕様）。
// - PDF: iframe で公開URLを直接表示。
// - Word(.docx): mammoth をクライアントで dynamic import し、HTMLに変換して表示。
// - PowerPoint(.pptx): 既存 jszip（extractPptxSlideTexts）でスライドごとにテキスト抽出して表示。
//   レイアウト非再現の注記を出す。
// - Excel・旧形式(.doc/.ppt/.xls)・変換失敗・タイムアウト: 「プレビュー非対応」＋DL導線に
//   フォールバック（エラーで落とさない）。
// - 変換はモーダルを開いた時に実行（一覧表示時に全件変換しない）。
// - 101 リンク型: YouTube は youtube-nocookie ドメインで埋め込み再生、
//   Dropbox・その他（ID抽出失敗含む）は埋め込まず「新しいタブで開く」ボタン。
// - 102 A4紙面表示: モーダル幅 min(96vw,980px)。DialogContent の既定 sm:max-w-sm に勝つには
//   sm: プレフィックス付きで上書きする必要がある（無印 max-w-* は sm 以上で既定に負けて狭くなる罠）。
//   docx/pptx 本文は A4 相当幅 794px の白い紙面＋約20mm余白で中央寄せ。体裁は globals.css の
//   .doc-preview スコープCSSで復元し、表は table-wrap でその表だけ横スクロールさせる。

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  fileKind,
  opensInBrowser,
  docVersionNumber,
  reviewStatus,
  docDisplayMeta,
  youtubeEmbedUrl,
  LINK_PROVIDER_META,
  type LibraryDoc,
} from "@/lib/library";
import { extractPptxSlideTexts } from "@/lib/library-extract";

type PreviewState =
  | { status: "loading" }
  | { status: "pdf" }
  | { status: "docx"; html: string }
  | { status: "pptx"; slides: string[] }
  | { status: "youtube"; embedUrl: string }
  | { status: "externalLink" }
  | { status: "unsupported" };

const CONVERT_TIMEOUT_MS = 20000;

// 拡張子の判定（.docx/.pptx のみ変換対応。旧 .doc/.ppt は非zipで変換不能）
function extOf(name: string): string {
  const n = (name || "").toLowerCase();
  const dot = n.lastIndexOf(".");
  return dot >= 0 ? n.slice(dot + 1) : "";
}

// 保存用URL（常にダウンロードを促す。LibraryBrowser の fileHref と同じ流儀）
function downloadHref(doc: LibraryDoc): string {
  const sep = doc.fileUrl.includes("?") ? "&" : "?";
  return `${doc.fileUrl}${sep}download=${encodeURIComponent(doc.fileName || "download")}`;
}

export default function LibraryPreviewModal({
  doc,
  onClose,
  onEdit,
}: {
  doc: LibraryDoc | null;
  onClose: () => void;
  onEdit: (doc: LibraryDoc) => void;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;

    // 101 リンク型: YouTubeは埋め込み、それ以外は「新しいタブで開く」（fetch/変換なし）
    if (doc.kind === "link") {
      const embedUrl =
        doc.linkProvider === "youtube" ? youtubeEmbedUrl(doc.linkUrl) : "";
      setState(
        embedUrl ? { status: "youtube", embedUrl } : { status: "externalLink" }
      );
      return;
    }

    const kind = fileKind(doc.mimeType, doc.fileName);
    const ext = extOf(doc.fileName);

    if (kind === "pdf") {
      setState({ status: "pdf" });
      return;
    }
    // 変換対応は OOXML（.docx/.pptx）のみ。旧形式・Excel・その他は非対応表示。
    const canDocx = kind === "word" && ext !== "doc";
    const canPptx = kind === "ppt" && ext !== "ppt";
    if (!canDocx && !canPptx) {
      setState({ status: "unsupported" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();
    (async () => {
      const res = await fetch(doc.fileUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = await res.arrayBuffer();
      if (cancelled) return;
      if (canDocx) {
        // mammoth はクライアント初回利用時のみ読み込む（一覧表示を重くしない）
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (cancelled) return;
        if (!result.value || !result.value.trim()) throw new Error("empty");
        // 102: 広い表はその表だけ横スクロールさせる（モーダル全体は横スクロールさせない）
        const html = result.value
          .replace(/<table/g, '<div class="table-wrap"><table')
          .replace(/<\/table>/g, "</table></div>");
        setState({ status: "docx", html });
      } else {
        const slides = await extractPptxSlideTexts(buf);
        if (cancelled) return;
        if (slides.length === 0 || slides.every((s) => s === "")) {
          throw new Error("empty");
        }
        setState({ status: "pptx", slides });
      }
    })().catch(() => {
      // タイムアウト・取得失敗・変換失敗はすべてDL導線にフォールバック
      if (!cancelled) setState({ status: "unsupported" });
    });
    const timer = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        controller.abort();
        setState({ status: "unsupported" });
      }
    }, CONVERT_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [doc]);

  if (!doc) return null;
  const meta = docDisplayMeta(doc);
  const isLink = doc.kind === "link";
  const isPdf = !isLink && opensInBrowser(doc.mimeType, doc.fileName);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[min(96vw,980px)] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 text-left">
            <span className="text-xl leading-none shrink-0">{meta.icon}</span>
            <span className="break-words">{doc.title}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            資料のプレビュー
          </DialogDescription>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              {doc.category}
            </Badge>
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {docVersionNumber(doc) > 1 && (
              <span className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                v{docVersionNumber(doc)}
              </span>
            )}
            {reviewStatus(doc.reviewDueAt) === "overdue" && (
              <span className="text-[10px] font-medium bg-red-100 text-red-700 rounded px-1.5 py-0.5">
                ⏰ 見直し時期です
              </span>
            )}
            {reviewStatus(doc.reviewDueAt) === "soon" && (
              <span className="text-[10px] font-medium bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                ⏰ まもなく見直し
              </span>
            )}
          </div>
        </DialogHeader>

        {/* 本文だけスクロール（ヘッダ・フッタは固定）。全体の横スクロールは出さない */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-muted/50">
          {state.status === "loading" && (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              <span className="animate-pulse">プレビューを準備しています…</span>
            </div>
          )}

          {state.status === "pdf" && (
            <iframe
              src={doc.fileUrl}
              title={doc.title}
              className="w-full h-[78vh] border rounded-lg bg-muted/30"
            />
          )}

          {/* 101: YouTube 埋め込み再生（プライバシー強化の nocookie ドメイン） */}
          {state.status === "youtube" && (
            <iframe
              src={state.embedUrl}
              title={doc.title}
              className="w-full aspect-video border rounded-lg bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}

          {/* 101: Dropbox・その他リンク（埋め込み不安定のため新規タブで開く） */}
          {state.status === "externalLink" && (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-center px-4">
              <p className="text-sm text-muted-foreground">
                {LINK_PROVIDER_META[doc.linkProvider].label}のリンクです。
                <br />
                新しいタブで開いてご覧ください。
              </p>
              <a href={doc.linkUrl} target="_blank" rel="noreferrer">
                <Button className="bg-teal text-teal-foreground">
                  🔗 新しいタブで開く
                </Button>
              </a>
              <p className="text-xs text-muted-foreground break-all max-w-full">
                {doc.linkUrl}
              </p>
            </div>
          )}

          {state.status === "docx" && (
            <div
              // A4紙面: 本文幅794px上限・白背景・約20mm相当の余白（スマホは控えめ）。
              // 体裁は globals.css の .doc-preview スコープCSSで復元（Tailwindリセット対策・指示書102）
              className="doc-preview mx-auto my-4 w-full max-w-[794px] bg-white border rounded-lg shadow-sm px-5 py-6 sm:px-[75px] sm:py-[64px]"
              // mammoth の変換結果（テキストはエスケープ済みのHTML）を表示する
              dangerouslySetInnerHTML={{ __html: state.html }}
            />
          )}

          {state.status === "pptx" && (
            <div className="mx-auto my-4 w-full max-w-[794px] space-y-3 px-1">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠ テキストのみの簡易プレビューです。レイアウトは再現されません。
                正式にご覧になるときはダウンロードしてください。
              </p>
              {state.slides.map((text, i) => (
                <div
                  key={i}
                  className="border rounded-lg space-y-1.5 bg-white shadow-sm px-5 py-4 sm:px-8 sm:py-6"
                >
                  <p className="text-xs font-semibold text-muted-foreground">
                    スライド {i + 1} / {state.slides.length}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-[1.7]">
                    {text || "（テキストなし）"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {state.status === "unsupported" && (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-center px-4">
              <p className="text-sm text-muted-foreground">
                この形式はプレビューに対応していません。
                <br />
                ダウンロードしてご覧ください。
              </p>
              <a href={downloadHref(doc)}>
                <Button className="bg-teal text-teal-foreground">
                  ⬇ ダウンロード
                </Button>
              </a>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2">
          {isLink ? (
            <a href={doc.linkUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                🔗 新しいタブで開く
              </Button>
            </a>
          ) : (
            <a href={downloadHref(doc)}>
              <Button variant="outline" size="sm">
                ⬇ ダウンロード
              </Button>
            </a>
          )}
          {isPdf && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(doc.fileUrl, "_blank", "noopener,noreferrer")
              }
              title="新規タブで開いて印刷"
            >
              🖨 印刷
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onEdit(doc)}>
            ✏️ 編集
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕ 閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
