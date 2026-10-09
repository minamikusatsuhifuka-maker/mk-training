// ディープリサーチの残り回数（指示書226 §3）
//   GET → { unlimited, limit, used, remaining, label }
// 院長、または「🔬 ディープリサーチ」を委任された幹部だけ（requireAdminItem）。
// **ここでは数えない**（画面に出すためだけ）。数えるのは実行のAPI。

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { deepResearchQuota } from "@/lib/deep-research/quota-server";
import { remainingLabel } from "@/lib/deep-research/quota";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  const state = await deepResearchQuota(auth.user);
  return NextResponse.json({ ...state, label: remainingLabel(state) });
}
