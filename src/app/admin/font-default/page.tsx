"use client";

// 🔤 全員の既定のフォント（指示書271 §2）— 院長＋委任の設定で任された人
// 自分でフォントを選んでいない人と、ログインの画面などログインしていない画面に使う。
// 最初の既定は「あ標準・標準」（今までと同じ）。「💾 保存」を押すまで誰の画面も変わらない。直した日時と人を残す。
// ページの到達可否は proxy.ts（/admin/<項目>）、APIは requireAdminItem が判定する。

import { useEffect, useState } from "react";
import {
  BUILTIN_FONT_PREF,
  FONT_CHOICES,
  SIZE_CHOICES,
  prefLabel,
  samePref,
  type FontPref,
} from "@/lib/font-pref";

type Def = (FontPref & { updatedAt?: string; updatedByName?: string }) | null;

const FONT_VAR: Record<FontPref["font"], string> = {
  noto: "var(--font-noto-sans-jp)",
  biz: "var(--font-biz-udp)",
  rounded: "var(--font-mplus-rounded)",
};

function fmt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export default function FontDefaultAdminPage() {
  const [def, setDef] = useState<Def>(null);
  const [draft, setDraft] = useState<FontPref | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/font-default", { cache: "reload", credentials: "same-origin" });
        const j = (await res.json().catch(() => ({}))) as { def?: Def; error?: string };
        if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
        setDef(j.def ?? null);
        setDraft(j.def ? { font: j.def.font, size: j.def.size } : BUILTIN_FONT_PREF);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込めませんでした");
      }
    })();
  }, []);

  const savedPref: FontPref = def ? { font: def.font, size: def.size } : BUILTIN_FONT_PREF;
  const dirty = !!draft && !samePref(draft, savedPref);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/font-default", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = (await res.json().catch(() => ({}))) as { def?: Def; error?: string };
      if (!res.ok) throw new Error(j.error || `保存できませんでした (${res.status})`);
      setDef(j.def ?? null);
      setFlash("保存しました");
      setTimeout(() => setFlash(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${
      active ? "border-teal-600 bg-teal-600 text-white font-semibold" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🔤 全員の既定のフォント</h1>
        <p className="mt-1 text-sm text-slate-600">
          自分でフォントを選んでいない人と、ログインの画面に使うフォントの種類と文字の大きさです。
          自分で選んだ人は、その人の選択のままです（その人が「既定に戻す」を押すと、ここで決めた既定になります）。
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {draft && (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 md:p-5" data-font-default-form>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">フォントの種類</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="既定のフォントの種類">
              {FONT_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${chip(draft.font === c.id)} ${c.preview}`}
                  aria-pressed={draft.font === c.id}
                  onClick={() => setDraft({ ...draft, font: c.id })}
                >
                  あ{c.label}
                  <span className="ml-1 text-xs opacity-80">（{c.desc}）</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">文字の大きさ</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="既定の文字の大きさ">
              {SIZE_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={chip(draft.size === c.id)}
                  aria-pressed={draft.size === c.id}
                  onClick={() => setDraft({ ...draft, size: c.id })}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-500">見本</p>
            <div
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-slate-800 leading-relaxed"
              style={{
                fontFamily: `${FONT_VAR[draft.font]}, sans-serif`,
                fontSize: `${16 * (SIZE_CHOICES.find((c) => c.id === draft.size)?.scale ?? 1)}px`,
              }}
              data-font-default-sample
            >
              南草津皮フ科 スタッフ研修　あいうえお　アイウエオ　0123456789
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "保存しています…" : "💾 保存"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(savedPref)}
                className="text-sm text-slate-500 underline underline-offset-2"
              >
                元に戻す
              </button>
            )}
            {flash && <span className="text-sm text-teal-700">{flash}</span>}
          </div>

          <p className="text-xs text-slate-500" data-font-default-current>
            今の既定：{prefLabel(savedPref)}
            {def?.updatedAt
              ? `（${fmt(def.updatedAt)}${def.updatedByName ? `・${def.updatedByName}` : ""} に保存）`
              : "（まだ決めていません。今までと同じです）"}
          </p>
          <p className="text-xs text-slate-500">
            保存すると、自分で選んでいない人は次に画面を開いたときから（遅くとも1分ほどで）この既定になります。
          </p>
        </section>
      )}
    </div>
  );
}
