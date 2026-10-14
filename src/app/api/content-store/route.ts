// content_store の唯一の外部入口（指示書145）
// ブラウザからの content_store 直接アクセス（anonキー）を全廃し、このAPIに集約する。
// - 読み取り: ログイン必須（未ログインで content_store を読む画面は存在しない）
// - 書き込み: ログイン必須＋管理者専用キーは管理者のみ（content-store-policy.ts が正本）
// 実体アクセスは service-role（content-store-server.ts）なので content_store の RLS 有効後も動く。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { canWriteAdminKeyByDelegation } from "@/lib/admin-delegation-server";
import {
  isAdminOnlyContentKey,
  isAllowedContentPrefix,
  isServerOnlyContentKey,
  isServerWriteOnlyContentKey,
  isValidContentKey,
} from "@/lib/content-store-policy";
import { redactForeignProfileRows } from "@/lib/content-store-redact";
import { loadTestSeedIds } from "@/lib/test-seed-server";
import { STAFF_PROFILES_INDEX_KEY } from "@/lib/staff-profiles";
import { FEATURE_FLAGS_KEY, IMPLEMENTED_FEATURES } from "@/lib/feature-flags";
import { isTestSeedUser } from "@/lib/test-seed";
import { hideContextFor } from "@/lib/test-seed-hide-server";
import { researchCreatorId } from "@/lib/deep-research/store";
import { hasTestSeed, hideTestSeed, isTestSeedItem, restoreHidden } from "@/lib/test-seed-hide";
import {
  serverDeleteContentRow,
  serverGetContentRow,
  serverGetContentRowsByPrefix,
  serverPutContentRow,
} from "@/lib/content-store-server";

// Response のボディは一度しか読めないため、使い回さず毎回生成する
const unauth = () =>
  NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ error: "権限がありません" }, { status: 403 });
// 157: サーバー専用キーは「無いもの」として扱う（403だとキーの存在が分かるため）
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return unauth();

  const url = new URL(req.url);
  const prefix = url.searchParams.get("prefix");
  if (prefix !== null) {
    if (!isAllowedContentPrefix(prefix)) return forbidden();
    const rows = await serverGetContentRowsByPrefix(prefix);
    // 237: 本物のスタッフ・幹部には、検証用アカウントの行（プロフィールなど）ごと渡さない
    const ctx = await hideContextFor(user);
    const visible = hasTestSeed(ctx)
      ? rows
          .filter((r) => !isTestSeedItem(r.data, ctx) && !Array.from(ctx.ids).some((id) => r.id === `staff_profile:${id}`))
          .map((r) => ({ ...r, data: hideTestSeed(r.data, ctx) }))
      : rows;
    // 146-E: 記念日は本人にしか渡さない（画面で隠すだけでなく配信段階で落とす）
    return NextResponse.json({ rows: redactForeignProfileRows(visible, user.id) });
  }

  const key = url.searchParams.get("key");
  if (!isValidContentKey(key)) {
    return NextResponse.json({ error: "キーが不正です" }, { status: 400 });
  }
  // 157: サーバー専用キー（menu_access）はこのAPIからは読み書きさせない
  if (isServerOnlyContentKey(key)) return hidden();
  const row = await serverGetContentRow(key);
  // 191-補: 検証用アカウントには、機能フラグがOFFの機能も表示する（実装済みの機能だけON。一般スタッフには適用しない）
  if (key === FEATURE_FLAGS_KEY && isTestSeedUser(user)) {
    const d = (row?.data ?? {}) as { features?: Record<string, unknown> };
    const features = { ...(d.features ?? {}) };
    for (const id of IMPLEMENTED_FEATURES) features[id] = true;
    return NextResponse.json({ row: { id: key, ...(row ?? {}), data: { ...d, features } } });
  }
  // 191 B: 検証用アカウントは一般スタッフの画面（メンバー・宛先候補・集計）に出さない。印は app_metadata（サーバーで判定）
  if (row && key === STAFF_PROFILES_INDEX_KEY && !isAdminUser(user)) {
    const testIds = await loadTestSeedIds();
    if (testIds.size > 0) {
      const d = (row.data ?? {}) as { items?: unknown[] };
      if (Array.isArray(d.items)) {
        return NextResponse.json({ row: { ...row, data: { ...d, items: d.items.filter((it) => !(it && typeof it === "object" && testIds.has(String((it as { userId?: unknown }).userId ?? "")))) } } });
      }
    }
  }
  // 237: 本物のスタッフ・幹部には、検証用アカウントとその中身を渡さない。
  //   検証用アカウントのもの（プロフィール・検証用が作ったリサーチ本文など）は「無い」と同じ応答。
  //   共有の保存場所（気づき・朝礼・タスク・リアクション・お知らせなど）は、検証用の分を外して渡す
  //   （書くときは PUT で戻す＝中身は消えない）
  const ctx = await hideContextFor(user);
  if (row && hasTestSeed(ctx)) {
    const isTestProfile = Array.from(ctx.ids).some((id) => key === `staff_profile:${id}`);
    // ディープリサーチの本文は作った人を持たないので、一覧から引いて確かめる
    const isTestResearch = key.startsWith("deep_research:") && ctx.ids.has(await researchCreatorId(key.slice("deep_research:".length)));
    if (isTestProfile || isTestResearch || isTestSeedItem(row.data, ctx)) return hidden();
    const shown = { ...row, data: hideTestSeed(row.data, ctx) };
    if (key.startsWith("staff_profile:")) {
      return NextResponse.json({ row: redactForeignProfileRows([shown], user.id)[0] });
    }
    return NextResponse.json({ row: shown });
  }
  // 182: 他人のプロフィールを1件で読むときも、一覧と同じ伏せ処理（記念日・サーベイ）を通す
  if (row && key.startsWith("staff_profile:")) {
    return NextResponse.json({ row: redactForeignProfileRows([row], user.id)[0] });
  }
  return NextResponse.json({ row });
}

export async function PUT(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return unauth();

  let body: { key?: unknown; contentType?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400 });
  }

  const { key, contentType, data } = body;
  if (!isValidContentKey(key)) {
    return NextResponse.json({ error: "キーが不正です" }, { status: 400 });
  }
  // 157: サーバー専用キー（menu_access）はこのAPIからは読み書きさせない
  if (isServerOnlyContentKey(key)) return hidden();
  // 172: 専用APIからしか書けないキー（操作ログを迂回させない）。読めるキーなので存在は隠さない
  if (isServerWriteOnlyContentKey(key)) return forbidden();
  // 182: プロフィール本体は本人（と管理者）だけ。他人のプロフィール（公開設定・サーベイを含む）を
  // この汎用APIから書き換えられないようにする（書き込みは /api/profile が正）
  if (key.startsWith("staff_profile:") && key !== `staff_profile:${user.id}` && !isAdminUser(user)) {
    return forbidden();
  }
  if (data === undefined) {
    return NextResponse.json({ error: "dataが必要です" }, { status: 400 });
  }
  // 183: 管理者専用キーは、その項目を委任された幹部にも書かせる（項目→キーの対応は lib/admin-items.ts）。
  // 機能フラグ・AI設定・招待設定など委任できない項目のキーは対応表に無いので、従来どおり管理者のみ
  if (isAdminOnlyContentKey(key) && !isAdminUser(user)) {
    if (!(await canWriteAdminKeyByDelegation(user.id, key))) return forbidden();
  }

  const type =
    typeof contentType === "string" && contentType
      ? contentType
      : key.split("_")[0];
  // 237: 本物のスタッフ・幹部には検証用の分を隠して渡しているので、書き戻すときに今の保存値から戻す
  //   （戻さないと、本物のスタッフが保存した瞬間に検証用アカウントの投稿・反応が消える）
  let toSave: unknown = data;
  const ctx = await hideContextFor(user);
  if (hasTestSeed(ctx)) {
    const current = await serverGetContentRow(key);
    if (current) toSave = restoreHidden(current.data, data, ctx);
  }
  const ok = await serverPutContentRow(key, type, toSave, user.email ?? undefined);
  if (!ok) {
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user } = await getSessionUser();
  if (!user) return unauth();

  let body: { key?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400 });
  }
  const { key } = body;
  if (!isValidContentKey(key)) {
    return NextResponse.json({ error: "キーが不正です" }, { status: 400 });
  }
  // 157: サーバー専用キー（menu_access）はこのAPIからは読み書きさせない
  if (isServerOnlyContentKey(key)) return hidden();
  if (isServerWriteOnlyContentKey(key)) return forbidden(); // 172
  // 削除は「設定を既定に戻す」用途。書き込みと同じ権限で判定する（183: 委任も同じ）。
  if (isAdminOnlyContentKey(key) && !isAdminUser(user)) {
    if (!(await canWriteAdminKeyByDelegation(user.id, key))) return forbidden();
  }

  const ok = await serverDeleteContentRow(key);
  if (!ok) {
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
