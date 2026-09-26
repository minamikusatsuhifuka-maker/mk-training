"use client";

// 委任の設定（指示書183）— 院長だけが開ける画面（/admin/delegation）
// - A: 幹部ごとに担当スタッフを複数指定（既定は誰も指定されていない）
// - B: 管理画面の項目ごとに開ける幹部を指名。委任できない項目は 🔒 で理由を表示し、操作できない
// 保存は /api/admin/delegation（院長のみ・requireAdmin）。幹部はこの画面にもAPIにも到達できない。

import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { key: string; label: string; href: string; delegable: boolean; reason: string; userIds: string[] };
type Roster = { userId: string; name: string; isAdmin: boolean; retired: boolean }[];

export function DelegationPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [karte, setKarte] = useState<Record<string, string[]>>({});
  const [roster, setRoster] = useState<Roster>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [manager, setManager] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/delegation", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("設定を取得できませんでした");
      const j = (await res.json()) as { items: Item[]; karte: Record<string, string[]>; roster: Roster };
      setItems(j.items);
      setKarte(j.karte);
      setRoster(j.roster);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 幹部の候補＝管理者でない有効なアカウント */
  const staff = useMemo(() => roster.filter((r) => !r.isAdmin && !r.retired), [roster]);
  const nameOf = (id: string) => roster.find((r) => r.userId === id)?.name ?? "（不明）";

  const save = async (body: { items?: Record<string, string[]>; karte?: Record<string, string[]> }) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/delegation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; items?: Record<string, string[]>; karte?: Record<string, string[]> };
      if (!res.ok) throw new Error(j.error ?? "保存に失敗しました");
      if (j.items) setItems((prev) => prev.map((it) => ({ ...it, userIds: j.items?.[it.key] ?? it.userIds })));
      if (j.karte) setKarte(j.karte);
      setMsg("💾 保存しました（すぐに反映されます）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const toggleItemUser = (item: Item, userId: string) => {
    const next = item.userIds.includes(userId) ? item.userIds.filter((x) => x !== userId) : [...item.userIds, userId];
    void save({ items: { [item.key]: next } });
  };

  const toggleAssignment = (staffId: string) => {
    if (!manager) return;
    const cur = karte[manager] ?? [];
    const next = cur.includes(staffId) ? cur.filter((x) => x !== staffId) : [...cur, staffId];
    void save({ karte: { [manager]: next } });
  };

  if (!loaded) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-800">🔑 委任の設定</h1>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          幹部スタッフに「担当スタッフの育成カルテの閲覧」と「管理画面の一部」を任せる設定です。
          <strong>既定は誰も指定されていません。</strong>変更はすぐに反映され、アカウントを無効化すると即座に見られなくなります。
          この画面と設定のAPIは院長だけが使えます（幹部は自分や他人の権限を変えられません）。
        </p>
      </header>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* A: カルテの担当スタッフ */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" data-section="karte">
        <h2 className="text-sm font-semibold text-slate-800">📗 育成カルテ：幹部ごとの担当スタッフ</h2>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          幹部が見られるのは担当スタッフのカルテだけで、内容は「学びの記録・自分の目標・1on1の約束と取り組み状況・本人が公開したサーベイ」に限られます（閲覧のみ）。
          院長メモ・評価・適性検査・履歴書・家族構成・連絡先・振り返り記録は出ません。幹部自身のカルテは対象外です。
        </p>
        <label className="block text-xs text-slate-700">
          幹部
          <select value={manager} onChange={(e) => setManager(e.target.value)} className="mt-1 w-full sm:max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[44px] bg-white">
            <option value="">選んでください</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
                {(karte[s.userId]?.length ?? 0) > 0 ? `（担当 ${karte[s.userId].length}人）` : ""}
              </option>
            ))}
          </select>
        </label>
        {manager && (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-600">{nameOf(manager)} さんが見られるスタッフ（チェック＝担当）</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {roster
                .filter((r) => r.userId !== manager && !r.isAdmin)
                .map((r) => (
                  <li key={r.userId}>
                    <label className="flex items-center gap-2 text-sm text-slate-800 min-h-[40px] rounded-md px-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={(karte[manager] ?? []).includes(r.userId)}
                        disabled={busy}
                        onChange={() => toggleAssignment(r.userId)}
                      />
                      {r.name}
                      {r.retired && <span className="text-[10px] text-slate-500">（退職）</span>}
                    </label>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {Object.entries(karte).filter(([, v]) => v.length > 0).length > 0 && (
          <div className="text-[11px] text-slate-700 border-t border-slate-100 pt-2">
            現在の指定:
            <ul className="mt-1 space-y-0.5">
              {Object.entries(karte)
                .filter(([, v]) => v.length > 0)
                .map(([m, v]) => (
                  <li key={m}>
                    {nameOf(m)} → {v.map(nameOf).join("・")}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      {/* B: 管理画面の項目別委任 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" data-section="items">
        <h2 className="text-sm font-semibold text-slate-800">⚙️ 管理画面：項目ごとに開ける幹部</h2>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          🔒 の項目は院長だけです（権限・アカウント・AI／課金・機微な個人情報・監査の記録）。指名した幹部の管理画面には、指名された項目だけが出ます。
        </p>
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className={`rounded-lg border p-2 ${it.delegable ? "border-slate-200" : "border-slate-200 bg-slate-50"}`} data-item={it.key} data-locked={it.delegable ? "0" : "1"}>
              <p className="text-sm text-slate-900">
                {it.delegable ? "" : "🔒 "}
                {it.label}
                <span className="ml-2 text-[11px] text-slate-500">{it.reason}</span>
              </p>
              {it.delegable ? (
                staff.length === 0 ? (
                  <p className="text-[11px] text-slate-500 mt-1">指名できる幹部（管理者でない有効なアカウント）がいません。</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {staff.map((s) => {
                      const on = it.userIds.includes(s.userId);
                      return (
                        <button
                          key={s.userId}
                          type="button"
                          disabled={busy}
                          onClick={() => toggleItemUser(it, s.userId)}
                          aria-pressed={on}
                          className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] ${
                            on ? "border-teal-500 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {on ? "✓ " : ""}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">院長のみ（委任できません）</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
