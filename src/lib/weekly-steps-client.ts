"use client";

// 🌱 今週の一歩（本人だけ）— ブラウザから本人のログインで直接読み書きする
//
// 【見られるのは本人だけ】Supabase の RLS（user_id = auth.uid()）。サーバーの特権キーで読む処理は作らない（指示書 §2）。
// 【表がまだ無いとき】SQL（docs/sql/成功の原則_今週の一歩_weekly_steps.sql）を院長が実行するまでは ready=false を返し、
//   画面は「今週の一歩」を出さない。
// 【集計しない】件数・達成率は数えない。通知・催促も送らない。

import { getSupabaseBrowserClient } from "./supabase-browser";
import { STEP_MEMO_MAX, STEP_TEXT_MAX, stepEndFor, type WeeklyStep } from "./success-principles";

const TABLE = "weekly_steps";
const COLS = "id, text, source, start_on, end_on, result, memo, created_at, updated_at";

/** 表が無い（SQL 実行前）ときのエラーか */
function isMissingTable(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === "PGRST205" || e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? "");
}

export type MyStepsResult = { ready: false } | { ready: true; steps: WeeklyStep[] };

export async function loadMySteps(): Promise<MyStepsResult> {
  const { data, error } = await getSupabaseBrowserClient().from(TABLE).select(COLS).order("start_on", { ascending: false }).limit(200);
  if (error) {
    if (isMissingTable(error)) return { ready: false };
    throw new Error("今週の一歩を読めませんでした");
  }
  return { ready: true, steps: (data ?? []) as WeeklyStep[] };
}

/** 一歩を決める（同じ期間に一歩があれば入れ替える＝1つの期間に1つ） */
export async function setMyStep(text: string, source: string, today: string, current: WeeklyStep | null): Promise<void> {
  const t = text.trim().slice(0, STEP_TEXT_MAX);
  if (!t) throw new Error("一歩を書いてください");
  const sb = getSupabaseBrowserClient();
  if (current) {
    const { error } = await sb.from(TABLE).update({ text: t, source: source.slice(0, 200) }).eq("id", current.id);
    if (error) throw new Error("保存できませんでした");
    return;
  }
  const { error } = await sb.from(TABLE).insert({ text: t, source: source.slice(0, 200), start_on: today, end_on: stepEndFor(today) });
  if (error) throw new Error(error.code === "23505" ? "この期間の一歩はもう決まっています。読み込み直してください" : "保存できませんでした");
}

export async function cancelMyStep(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from(TABLE).delete().eq("id", id);
  if (error) throw new Error("取り消せませんでした");
}

export async function recordMyStep(id: string, result: "done" | "more", memo: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from(TABLE).update({ result, memo: memo.slice(0, STEP_MEMO_MAX) }).eq("id", id);
  if (error) throw new Error("保存できませんでした");
}
