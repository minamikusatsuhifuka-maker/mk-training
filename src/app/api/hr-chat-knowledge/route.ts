import { NextRequest, NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/feature-flags";
import { buildHrChatKnowledge } from "@/lib/hr-chat-knowledge";

// 指示書138: AI院長（ai-incho）へ人事制度知識ブロックを供給する内部API。
// - 共有トークン必須: HR_CHAT_KNOWLEDGE_TOKEN 未設定=404・不一致=401（fail-close）
// - hr_portal フラグOFF・フラグ取得失敗時は enabled:false（呼び出し側は注入なし＝fail-close）
// - 知識本文は lib/hr-chat-knowledge.ts（単一情報源 data/hr-portal.ts から機械導出）を共用。
//   外部アプリから読むため /hr 系パスは本番URLで絶対化する。

export const maxDuration = 15;

const PORTAL_BASE_URL = "https://mk-training.vercel.app";

export async function GET(req: NextRequest) {
  const token = process.env.HR_CHAT_KNOWLEDGE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (req.headers.get("x-hr-knowledge-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const flags = await getFeatureFlags();
    if (!flags.hr_portal) {
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({
      enabled: true,
      block: buildHrChatKnowledge({ portalBaseUrl: PORTAL_BASE_URL }),
    });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
