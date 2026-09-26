// 学びの記録の設定API（指示書179 B-3）— **管理者のみ**
//   GET → { config }
//   PUT { aiDraftEnabled } → AI下書きのON/OFF
//
// ONにできるのは「AIのAPIが有料枠で、送信内容が学習に使われない契約であること」を
// 院長が確認したとき（B-3）。画面にその旨を常時表示し、誰がいつ確認してONにしたかを記録する。
// 既定はOFF（コードから契約区分を確かめられないため）。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchGrowthConfig,
  recordGrowthLog,
  saveGrowthConfig,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const config = await fetchGrowthConfig(auth.admin);
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body || typeof body.aiDraftEnabled !== "boolean") return badRequest("不正なリクエストです");

  try {
    const prev = await fetchGrowthConfig(auth.admin);
    const by = auth.userEmail || auth.userId;
    const now = new Date().toISOString();
    const next = {
      aiDraftEnabled: body.aiDraftEnabled,
      aiDraftConfirmedBy: body.aiDraftEnabled ? by : "",
      aiDraftConfirmedAt: body.aiDraftEnabled ? now : "",
    };
    await saveGrowthConfig(auth.admin, next, by);
    if (prev.aiDraftEnabled !== next.aiDraftEnabled) {
      await recordGrowthLog(auth.admin, {
        by,
        action: "設定変更",
        kind: "設定",
        target: "AI下書き",
        changes: [
          {
            field: "AI下書き",
            before: prev.aiDraftEnabled ? "ON" : "OFF",
            after: next.aiDraftEnabled ? "ON（有料枠を確認済み）" : "OFF",
          },
        ],
      });
    }
    return NextResponse.json({ config: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
