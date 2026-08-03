// コーポレートブックのページ画像配信（131-補2・閲覧専用化）
// - PDFファイルは一切配信しない（131-補のPDF配信・?download=1 は廃止）。
//   実体は private/corporate-book-pages/page-001..053.jpg（事前生成・
//   scripts/generate-corporate-book-pages.js で再生成）。
// - ログイン済みスタッフのみ（未ログイン401＝画像URL直叩きにも認証が効く）。
// - キャッシュは private（本人ブラウザのみ1時間）。CDN・共有キャッシュには載せない。
// - 改訂手順: private/のPDF差し替え → 生成スクリプト実行 → 生成物コミット（版管理）。

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { CORPORATE_BOOK_PAGE_COUNT } from "@/lib/corporate-book";

export const runtime = "nodejs";
export const maxDuration = 30;

const PAGES_DIR = path.join(process.cwd(), "private", "corporate-book-pages");

export async function GET(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "ログインが必要です" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const pageParam = new URL(req.url).searchParams.get("page");
  const page = Number(pageParam);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > CORPORATE_BOOK_PAGE_COUNT
  ) {
    return NextResponse.json(
      { error: `page は 1〜${CORPORATE_BOOK_PAGE_COUNT} で指定してください` },
      { status: 400 }
    );
  }

  try {
    const file = path.join(
      PAGES_DIR,
      `page-${String(page).padStart(3, "0")}.jpg`
    );
    const buf = await fs.readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        // 認証付き配信: 本人ブラウザのみ1時間（ページ送りの再表示を高速化）
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ページ画像の読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
