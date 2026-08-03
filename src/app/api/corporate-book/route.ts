// コーポレートブックPDFの認証付き配信（131-補）
// - 実体は public ではなく private/corporate-design-book.pdf（リポジトリ内・CDN直配信されない）。
//   Vercel Functions へのバンドルは next.config.ts の outputFileTracingIncludes で保証。
// - ログイン済みスタッフのみ配信（未ログイン401）。?download=1 で添付ダウンロード。
// - 改訂時は private/ のPDFを差し替える1コミットのみ（版管理・指示書131の原則を維持）。

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSessionUser } from "@/lib/staff-profiles-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const PDF_FILE = path.join(
  process.cwd(),
  "private",
  "corporate-design-book.pdf"
);
const DOWNLOAD_NAME = "コーポレートデザインブック_2026年7月版.pdf";

export async function GET(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "ログインが必要です" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const buf = await fs.readFile(PDF_FILE);
    const download =
      new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        // 認証付き配信のためCDN・共有キャッシュに載せない
        "Cache-Control": "private, no-store",
        "Content-Disposition": download
          ? `attachment; filename*=UTF-8''${encodeURIComponent(DOWNLOAD_NAME)}`
          : "inline",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PDFの読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
