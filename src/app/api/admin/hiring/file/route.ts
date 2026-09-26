// 採用資料の署名URL再発行（指示書184 2-2）— **院長のみ**
//   GET ?id=<資料id> → { url（10分有効）, mimeType, fileName }
// 一覧の署名URLは10分で切れるため、開くときにその都度発行する（1タップで開ける・2-3）。

import { NextRequest, NextResponse } from "next/server";
import {
  HiringBucketMissingError,
  HiringTableMissingError,
  ServiceRoleMissingError,
  authorizeHiring,
  fetchHiringDoc,
  signHiringDocs,
} from "@/lib/hiring-docs-server";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const doc = await fetchHiringDoc(auth.admin, id);
    if (!doc) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const signed = await signHiringDocs(auth.admin, [doc]);
    const url = signed.docs[0]?.signedUrl ?? "";
    if (!url) {
      return NextResponse.json(
        { error: signed.bucketMissing ? new HiringBucketMissingError().message : "署名URLを発行できませんでした" },
        { status: 503 }
      );
    }
    return NextResponse.json({ url, mimeType: doc.mimeType, fileName: doc.fileName });
  } catch (e) {
    if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
