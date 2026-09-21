// 発表の構成案API（指示書174）— **管理者のみ**（173と同じ権限・非許可は404）
//   GET   → { saved, tableMissing }（直近の生成結果。開き直しても再生成しない）
//   POST  → { conditions, pasteText } で2案＋推奨を生成して保存 → { saved }
//   PATCH → { chosen: 0|1 } で確定案を切り替えて保存 → { saved }
//
// 【匿名化（174-4）】AIに送る前に、173の記録・貼り付けシート・条件の自由記述すべてを
// 役割名へ置換する（buildNameReplacer＝173の出力と同じ名簿）。保存する素材も置換済みのもの。
// 【事実性（174-3）】システムプロンプトに「素材にないことを作らない／足りない幕は記録なし」を明記（presentation-plan.ts）。
// 【AI基盤】既存の callAI（管理トグルの Claude/Gemini・既存キー）。新しいキー・環境変数は使わない。

import { NextResponse } from "next/server";
import {
  authorizeDirectorRetrospective,
  fetchAllRecords,
  loadStaffRoster,
  recordRetrospectiveLog,
  RetrospectiveTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/director-retrospective-server";
import { buildNameReplacer } from "@/lib/director-retrospective";
import {
  generatePlan,
  loadPresentationPlan,
  savePresentationPlan,
} from "@/lib/presentation-plan-server";
import {
  PASTE_MAX,
  anonymizeConditions,
  buildMaterialFromPaste,
  buildMaterialFromRecords,
  normalizeConditions,
  type PresentationPlanSaved,
} from "@/lib/presentation-plan";

export const runtime = "nodejs";
// 構成案の生成はAI呼び出し（最大2回）を含むため長めに取る
export const maxDuration = 120;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof RetrospectiveTableMissingError) {
    return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export async function GET() {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();
  try {
    const { saved, tableMissing } = await loadPresentationPlan(auth.admin);
    return NextResponse.json({ saved, tableMissing });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const conditionsRaw = normalizeConditions(body.conditions);
  const pasteText = typeof body.pasteText === "string" ? body.pasteText.slice(0, PASTE_MAX) : "";
  if (conditionsRaw.source === "paste" && !pasteText.trim()) {
    return NextResponse.json({ error: "振り返りシートを貼り付けてください" }, { status: 400 });
  }

  try {
    // 送信前の匿名化（174-4）: 名簿は173の出力と同じ
    const replacer = buildNameReplacer(await loadStaffRoster(auth.admin));
    const conditions = anonymizeConditions(conditionsRaw, replacer);

    let material: string;
    if (conditions.source === "records") {
      const { data, tableMissing } = await fetchAllRecords(auth.admin);
      if (tableMissing) throw new RetrospectiveTableMissingError();
      const periodCount = data.periods.filter(
        (p) => !conditions.periodIds || conditions.periodIds.includes(p.id)
      ).length;
      if (periodCount === 0) {
        return NextResponse.json(
          { error: "173の記録に期がありません。期を登録するか、振り返りシートの貼り付けを選んでください" },
          { status: 400 }
        );
      }
      material = buildMaterialFromRecords(data, conditions.periodIds, replacer, todayJst());
    } else {
      material = buildMaterialFromPaste(pasteText, replacer);
    }

    const outcome = await generatePlan(conditions, material);
    const by = auth.userEmail || auth.userId;
    if (!outcome.ok) {
      await recordRetrospectiveLog(auth.admin, {
        by,
        action: "生成",
        kind: "発表構成案",
        target: "",
        changes: [
          { field: "結果", before: "", after: `失敗（${outcome.kind}）` },
          { field: "AI", before: "", after: `${outcome.provider} / ${outcome.model}` },
        ],
      });
      return NextResponse.json(
        { error: outcome.message, retry: true },
        { status: outcome.kind === "ai" ? 502 : 422 }
      );
    }

    const now = new Date().toISOString();
    const saved: PresentationPlanSaved = {
      conditions,
      material,
      result: outcome.result,
      chosen: outcome.result.recommended,
      provider: outcome.provider,
      model: outcome.model,
      generatedAt: now,
      updatedAt: now,
    };
    await savePresentationPlan(auth.admin, saved, by);
    await recordRetrospectiveLog(auth.admin, {
      by,
      action: "生成",
      kind: "発表構成案",
      target: "",
      changes: [
        {
          field: "入力元",
          before: "",
          after:
            conditions.source === "records"
              ? `173の記録（${conditions.periodIds ? `${conditions.periodIds.length}期` : "全期"}）`
              : "振り返りシートの貼り付け",
        },
        { field: "発表時間", before: "", after: `${conditions.minutes}分` },
        { field: "推奨案", before: "", after: outcome.result.recommended === 0 ? "A" : "B" },
        { field: "AI", before: "", after: `${outcome.provider} / ${outcome.model}` },
      ],
    });
    return NextResponse.json({ saved });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const chosen = body.chosen === 1 ? 1 : body.chosen === 0 ? 0 : null;
  if (chosen === null) {
    return NextResponse.json({ error: "chosen は 0 か 1 です" }, { status: 400 });
  }

  try {
    const { saved } = await loadPresentationPlan(auth.admin);
    if (!saved) {
      return NextResponse.json({ error: "先に構成案を作ってください" }, { status: 404 });
    }
    const by = auth.userEmail || auth.userId;
    const next: PresentationPlanSaved = { ...saved, chosen, updatedAt: new Date().toISOString() };
    await savePresentationPlan(auth.admin, next, by);
    if (saved.chosen !== chosen) {
      await recordRetrospectiveLog(auth.admin, {
        by,
        action: "確定",
        kind: "発表構成案",
        target: "",
        changes: [
          { field: "採用する案", before: saved.chosen === 0 ? "A" : "B", after: chosen === 0 ? "A" : "B" },
        ],
      });
    }
    return NextResponse.json({ saved: next });
  } catch (e) {
    return errorResponse(e);
  }
}
