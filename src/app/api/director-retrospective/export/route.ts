// 院長の振り返り記録の Markdown 出力（指示書173-4）— **管理者のみ**
//   GET ?periods=id1,id2&anonymize=1 → text/markdown（添付ファイル）
//     periods 省略 = 全期 ／ anonymize は "0" と明示したときだけ OFF（**既定ON**）
//
// ダウンロードは院長が自分で開始する（自動送信・自動保存はしない）。
// 匿名化ONでは、登録済みスタッフの氏名（プロフィール・アカウント・連絡先）を役割名に置き換える。
// 出力したことは操作ログに残す（匿名化の有無と対象の期数だけ。本文は残さない）。

import { NextResponse } from "next/server";
import {
  authorizeDirectorRetrospective,
  fetchAllRecords,
  loadStaffRoster,
  recordRetrospectiveLog,
  RetrospectiveTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/director-retrospective-server";
import {
  buildNameReplacer,
  buildRetrospectiveMarkdown,
} from "@/lib/director-retrospective";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export async function GET(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();

  const params = new URL(req.url).searchParams;
  const periodsParam = params.get("periods");
  const periodIds = periodsParam
    ? periodsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  // 既定ON。"0" と明示したときだけOFF
  const anonymize = params.get("anonymize") !== "0";

  try {
    const { data, tableMissing } = await fetchAllRecords(auth.admin);
    if (tableMissing) {
      return NextResponse.json(
        { error: "テーブルが未作成です", tableMissing: true },
        { status: 503 }
      );
    }
    const replacer = anonymize ? buildNameReplacer(await loadStaffRoster(auth.admin)) : null;
    const today = todayJst();
    const md = buildRetrospectiveMarkdown(data, {
      periodIds: periodIds && periodIds.length > 0 ? periodIds : null,
      anonymize,
      replacer,
      today,
    });

    const count = periodIds ? periodIds.length : data.periods.length;
    await recordRetrospectiveLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "出力",
      kind: "Markdown",
      target: "",
      changes: [
        { field: "匿名化", before: "", after: anonymize ? "ON" : "OFF" },
        { field: "対象", before: "", after: periodIds ? `${count}期を選択` : `全期（${count}期）` },
      ],
    });

    const filename = `院長の振り返り記録_${today}${anonymize ? "_匿名化" : ""}.md`;
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="retrospective.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RetrospectiveTableMissingError) {
      return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
    }
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "出力に失敗しました" },
      { status: 500 }
    );
  }
}
