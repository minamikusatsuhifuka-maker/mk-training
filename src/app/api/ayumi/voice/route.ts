// 📜 当院の歩み：関わった人の声（指示書253 §2・§4）
//
//   PUT    { entryId, text }          → 自分の声を書く・直す（その出来事の「関わった人」に選ばれた本人だけ・200字まで）
//   DELETE { entryId, userId? }       → 声を消す（自分の声は本人。どの声も、院長と任された幹部）
//
// ほかの人は書けない（404と同じ応答）。判定は authorizeAyumi と canWriteVoice。

import { NextResponse, type NextRequest } from "next/server";
import { authorizeAyumi, deleteVoice, loadEntry, peopleCandidates, saveVoice, visibleEntries } from "@/lib/ayumi-server";
import { VOICE_MAX, canWriteVoice } from "@/lib/ayumi";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });

export async function PUT(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  try {
    const e = entryId ? await loadEntry(auth.admin, entryId) : null;
    if (!e || visibleEntries([e], auth.user).length === 0 || !canWriteVoice(e, auth.user.id)) return hidden();
    if (!text) return bad("ひとことを入れてください");
    if (text.length > VOICE_MAX) return bad(`ひとことは${VOICE_MAX}字までです`);
    const me = (await peopleCandidates(auth.admin, auth.testSeed).catch(() => [])).find((p) => p.id === auth.user.id);
    const voice = await saveVoice(
      auth.admin,
      {
        entryId,
        userId: auth.user.id,
        name: me?.name || e.people.find((p) => p.id === auth.user.id)?.name || "",
        text,
        ...(auth.testSeed ? { testSeed: true } : {}),
        updatedAt: "",
      },
      auth.user.email ?? auth.user.id
    );
    return NextResponse.json({ voice }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  const userId = typeof body.userId === "string" && body.userId ? body.userId : auth.user.id;
  try {
    const e = entryId ? await loadEntry(auth.admin, entryId) : null;
    if (!e || visibleEntries([e], auth.user).length === 0) return hidden();
    // 自分の声は本人が消せる。ほかの人の声は院長と任された幹部だけ
    if (userId !== auth.user.id && !auth.canWrite) return hidden();
    await deleteVoice(auth.admin, entryId, userId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "消せませんでした" }, { status: 500, headers: NO_STORE });
  }
}
