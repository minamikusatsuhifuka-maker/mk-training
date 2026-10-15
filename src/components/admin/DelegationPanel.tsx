"use client";

// 委任の設定（指示書183）— 院長だけが開ける画面（/admin/delegation）
// - A: 幹部ごとに担当スタッフを複数指定（既定は誰も指定されていない）
// - B: 管理画面の項目ごとに開ける幹部を指名。委任できない項目は 🔒 で理由を表示し、操作できない
// - 226: 「🗓 1on1の日程」と「🔬 ディープリサーチ」も委任できる。
//   ディープリサーチだけ、任された1人あたりの**月の上限**をここで決める（初期値30・院長は上限なし）
// 保存は /api/admin/delegation（院長のみ・requireAdmin）。幹部はこの画面にもAPIにも到達できない。
// 委任の設定の折りたたみとポップアップ（2026-10-15）: 見た目と操作だけの変更。
//   各項目は1行に折りたたみ（項目名・説明・指名中の人／「指名なし」）、指名はポップアップの名前ボタンで行う。
//   パソコンはカーソルを合わせると開く（行からポップアップへ動かしても閉じない）。スマホ・タブレットはタップで開閉、
//   キーボードは Tab で行へ移動して Enter。開くのは1つだけ。🔒の項目は開かない。
//   保存の仕組み（押すとすぐ /api/admin/delegation に保存）・判定・記録は今までどおり。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEEP_RESEARCH_DEFAULT_LIMIT,
  DEEP_RESEARCH_LIMIT_MAX,
  DEEP_RESEARCH_LIMIT_MIN,
  deepResearchDelegationReason,
  normalizeLimit,
} from "@/lib/deep-research/quota";

type Item = { key: string; label: string; href: string; delegable: boolean; reason: string; userIds: string[] };
type Roster = { userId: string; name: string; isAdmin: boolean; retired: boolean; testSeed?: boolean }[];

/** マウスが行とポップアップの両方から離れてから閉じるまでの猶予（すき間を渡れるように） */
const LEAVE_CLOSE_MS = 250;

/**
 * 指名のポップアップ（1つだけ開く）。body の直下に出し、画面の端で切れない位置に置く。
 * 257: カーソルを合わせて開いたとき（パソコン）は、行の**タイトルの文字の末尾から14px右**・行の上端の14px上に出す
 *   （タイトルの列はふさがない＝下の行へまっすぐ動かせる。説明の文の上には重なってよい）。
 *   右に入りきらなければ画面の右端の中に収める。それでもタイトルの文字にかかってしまう狭さのときは、行の下に出す。
 *   押して開いたとき（スマホ・キーボード）は256のまま行の下。形は縦のチェックリスト（院長が選んだ案C）。
 * 中を一度でも押したら、カーソルが外に出ても閉じない（外を押す・Esc・行をもう一度押すと閉じる）。
 */
function ItemPopover({
  anchor,
  side,
  label,
  onPointerEnter,
  onPointerLeave,
  onPin,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  /** right＝行の右側（カーソルで開いたとき）／below＝行の下（押して開いたとき） */
  side: "right" | "below";
  label: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPin: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const b = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left: number;
      let top: number;
      const title = anchor.querySelector<HTMLElement>("[data-deleg-title]")?.getBoundingClientRect() ?? null;
      const titleEnd = title ? title.right : b.left;
      const rightLeft = Math.min(titleEnd + 14, vw - w - 8);
      if (side === "right" && rightLeft >= titleEnd + 4) {
        // タイトルの末尾のすぐ右に（入りきらなければ画面の右端の中へ・タイトルの文字にはかぶせない）
        left = rightLeft;
        top = Math.min(Math.max(8, b.top - 14), Math.max(8, vh - h - 8));
      } else {
        left = Math.min(Math.max(8, b.left), Math.max(8, vw - w - 8));
        top = b.bottom + 4;
        if (top + h > vh - 8) top = b.top - h - 4 >= 8 ? b.top - h - 4 : Math.max(8, vh - h - 8);
      }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, side]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (ref.current?.contains(t) || anchor.contains(t))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${label} を任せる幹部`}
      data-deleg-popover
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onPointerEnter();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onPointerLeave();
      }}
      onPointerDownCapture={onPin}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        visibility: "hidden",
        zIndex: 60,
        width: "min(268px, calc(100vw - 16px))",
        maxHeight: "calc(100vh - 16px)",
        border: "1px solid #d6e6e1",
        borderRadius: 16,
        boxShadow: "0 14px 34px rgba(24,66,58,0.16)",
      }}
      className="flex flex-col bg-white p-3.5"
    >
      {children}
    </div>,
    document.body
  );
}

export function DelegationPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [karte, setKarte] = useState<Record<string, string[]>>({});
  const [roster, setRoster] = useState<Roster>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [manager, setManager] = useState("");
  // 226 §3: ディープリサーチの月の上限（任された幹部1人あたり）
  const [drLimit, setDrLimit] = useState(DEEP_RESEARCH_DEFAULT_LIMIT);
  const [drInput, setDrInput] = useState(String(DEEP_RESEARCH_DEFAULT_LIMIT));
  // 開いているポップアップ（1つだけ）。pinned＝押して開いた／中を押した（カーソルが外れても閉じない）
  const [openItem, setOpenItem] = useState<{ key: string; el: HTMLElement; side: "right" | "below" } | null>(null);
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedKey, setSavedKey] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/delegation", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error("設定を取得できませんでした");
      const j = (await res.json()) as {
        items: Item[];
        karte: Record<string, string[]>;
        roster: Roster;
        deepResearchLimit?: number;
      };
      setItems(j.items);
      setKarte(j.karte);
      setRoster(j.roster);
      if (typeof j.deepResearchLimit === "number") {
        setDrLimit(j.deepResearchLimit);
        setDrInput(String(j.deepResearchLimit));
      }
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
  // 207: 検証用アカウント（🧪）も候補に出す。**院長だけが見るこの画面に限る**
  //   （191 B の「一般スタッフの画面には出さない」は変えていない）。
  //   検証用の幹部に指定できる担当は検証用のスタッフだけで、組み合わせの判定は
  //   画面とサーバー（/api/admin/delegation）の両方で行う。
  const staff = useMemo(() => roster.filter((r) => !r.isAdmin && !r.retired), [roster]);
  const isTest = (id: string) => !!roster.find((r) => r.userId === id)?.testSeed;
  const nameOf = (id: string) => roster.find((r) => r.userId === id)?.name ?? "（不明）";
  /** 207-3: 検証用は名前に🧪を付けて実在の幹部と見分ける */
  const labelOf = (r: Roster[number]) => `${r.name}${r.testSeed ? "（🧪 検証用）" : ""}`;

  const save = async (body: {
    items?: Record<string, string[]>;
    karte?: Record<string, string[]>;
    deepResearchLimit?: number;
  }) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/delegation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: Record<string, string[]>;
        karte?: Record<string, string[]>;
        deepResearchLimit?: number;
      };
      if (!res.ok) throw new Error(j.error ?? "保存に失敗しました");
      // 207: 組み合わせが合わずサーバーが断った場合は 200 で理由が返る。
      //   画面の表示はサーバーの結果で上書きするので、押した見た目だけが残ることはない
      if (j.items) setItems((prev) => prev.map((it) => ({ ...it, userIds: j.items?.[it.key] ?? it.userIds })));
      if (j.karte) setKarte(j.karte);
      if (typeof j.deepResearchLimit === "number") {
        setDrLimit(j.deepResearchLimit);
        setDrInput(String(j.deepResearchLimit));
        // 226 §1: 項目の説明に出る数字も、保存した値にそろえる
        setItems((prev) =>
          prev.map((it) =>
            it.key === "deep-research"
              ? { ...it, reason: deepResearchDelegationReason(j.deepResearchLimit as number) }
              : it
          )
        );
      }
      if (j.error) {
        setError(j.error);
        setMsg("");
        return;
      }
      setMsg("💾 保存しました（すぐに反映されます）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const toggleItemUser = (item: Item, userId: string) => {
    const next = item.userIds.includes(userId) ? item.userIds.filter((x) => x !== userId) : [...item.userIds, userId];
    setSavedKey("");
    void save({ items: { [item.key]: next } }).then(() => setSavedKey(item.key));
  };

  // ─── ポップアップの開け閉め ───
  const cancelLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };
  const closePopover = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
    pinned.current = false;
    setOpenItem(null);
    setSavedKey("");
  }, []);
  const openPopover = (key: string, el: HTMLElement, pin: boolean) => {
    // 押して開いた（または中を押した）ポップアップがあるあいだは、ほかの行にカーソルが通っても切り替えない
    if (!pin && pinned.current && openItem && openItem.key !== key) return;
    cancelLeave();
    if (openItem?.key !== key) {
      // ほかの行のポップアップは閉じて、こちらを開く（開くのは1つだけ）
      pinned.current = pin;
      setSavedKey("");
      // 256: カーソルで開いたら行の右側、押して開いたら（スマホ・キーボード）行の下
      setOpenItem({ key, el, side: pin ? "below" : "right" });
    } else if (pin) {
      pinned.current = true;
    }
  };
  const scheduleLeave = () => {
    if (pinned.current) return;
    cancelLeave();
    leaveTimer.current = setTimeout(() => {
      if (!pinned.current) closePopover();
    }, LEAVE_CLOSE_MS);
  };
  useEffect(() => () => cancelLeave(), []);

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
          幹部スタッフに「担当スタッフの可能性ノートの閲覧」と「管理画面の一部」を任せる設定です。
          <strong>既定は誰も指定されていません。</strong>変更はすぐに反映され、アカウントを無効化すると即座に見られなくなります。
          この画面と設定のAPIは院長だけが使えます（幹部は自分や他人の権限を変えられません）。
        </p>
      </header>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* A: カルテの担当スタッフ */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" data-section="karte">
        <h2 className="text-sm font-semibold text-slate-800">🌱 可能性ノート：幹部ごとの担当スタッフ</h2>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          幹部が見られるのは担当スタッフの可能性ノートだけで、内容は「学びの記録・自分の目標・1on1の約束と取り組み状況・本人が公開したサーベイ」に限られます（閲覧のみ）。
          院長メモ・評価・適性検査・履歴書・家族構成・連絡先・振り返り記録は出ません。幹部自身の可能性ノートは対象外です。
        </p>
        <label className="block text-xs text-slate-700">
          幹部
          <select value={manager} onChange={(e) => setManager(e.target.value)} className="mt-1 w-full sm:max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm min-h-[44px] bg-white">
            <option value="">選んでください</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {labelOf(s)}
                {(karte[s.userId]?.length ?? 0) > 0 ? `（担当 ${karte[s.userId].length}人）` : ""}
              </option>
            ))}
          </select>
        </label>
        {manager && (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-600">{nameOf(manager)} さんが見られるスタッフ（チェック＝担当）</p>
            {/* 207-1: 組み合わせの決まりを画面にも書く（判定はサーバーが正） */}
            <p className="text-[11px] text-violet-700" data-karte-pairing>
              {isTest(manager)
                ? "🧪 検証用の幹部には、🧪 検証用のスタッフだけを指定できます。"
                : "実在の幹部に🧪 検証用のスタッフは指定できません。"}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {roster
                .filter((r) => r.userId !== manager && !r.isAdmin)
                // 191 B: 検証用の幹部には検証用のスタッフだけ、通常の幹部には検証用を出さない
                .filter((r) => !!r.testSeed === !!roster.find((m) => m.userId === manager)?.testSeed)
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
                      {r.testSeed && <span className="text-[10px] text-violet-700">🧪 検証用</span>}
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
          各行にカーソルを合わせる（スマートフォンはタップ）と、指名する人を選べます。
        </p>
        <ul className="space-y-1.5">
          {items.map((it) => {
            const names = it.userIds.map((id) => {
              const r = roster.find((x) => x.userId === id);
              return r ? labelOf(r) : nameOf(id);
            });
            const isOpen = openItem?.key === it.key;
            return (
              <li key={it.key} data-item={it.key} data-locked={it.delegable ? "0" : "1"}>
                {it.delegable ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    data-deleg-row={it.key}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") openPopover(it.key, e.currentTarget, false);
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType === "mouse") scheduleLeave();
                    }}
                    onClick={(e) => {
                      // 押したとき：開いていて固定済みなら閉じる。そうでなければ開いて固定（タップ・クリック・Enter）
                      if (isOpen && pinned.current) closePopover();
                      else openPopover(it.key, e.currentTarget, true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (isOpen && pinned.current) closePopover();
                        else openPopover(it.key, e.currentTarget, true);
                      }
                    }}
                    className={`flex min-h-[48px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      isOpen ? "border-teal-400 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <p className="min-w-0 flex-1 text-sm text-slate-900">
                      <span data-deleg-title>{it.label}</span>
                      <span className="ml-2 text-[11px] text-slate-500">{it.reason}</span>
                    </p>
                    <span
                      className={`shrink-0 text-xs ${names.length ? "font-medium text-teal-800" : "text-slate-400"}`}
                      data-deleg-names={it.key}
                    >
                      {names.length ? names.join("、") : "指名なし"}
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-[11px] text-slate-400">
                      {isOpen ? "▴" : "▾"}
                    </span>
                  </div>
                ) : (
                  <div className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" data-deleg-locked={it.key}>
                    <p className="min-w-0 flex-1 text-sm text-slate-900">
                      🔒 {it.label}
                      <span className="ml-2 text-[11px] text-slate-500">{it.reason}</span>
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-500">院長のみ（委任できません）</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {openItem &&
          (() => {
            const it = items.find((x) => x.key === openItem.key);
            if (!it || !it.delegable) return null;
            return (
              <ItemPopover
                anchor={openItem.el}
                side={openItem.side}
                label={it.label}
                onPointerEnter={cancelLeave}
                onPointerLeave={scheduleLeave}
                onPin={() => {
                  pinned.current = true;
                  cancelLeave();
                }}
                onClose={closePopover}
              >
                {/* 257: 縦のチェックリスト（案C） */}
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <p className="text-[13px] font-bold text-teal-700">指名する人</p>
                  <button type="button" onClick={closePopover} className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700" data-deleg-close>
                    閉じる
                  </button>
                </div>
                <p className="mt-1 shrink-0 text-[12px] leading-snug text-slate-500">押すと、その人の指名・解除が切り替わり、すぐに保存されます。</p>
                {staff.length === 0 ? (
                  <p className="text-[11px] text-slate-500 mt-2">指名できる幹部（管理者でない有効なアカウント）がいません。</p>
                ) : (
                  // 人数が多くて入りきらないときは、名前の並びの所だけを中で動かす
                  <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto" data-deleg-buttons={it.key}>
                    {staff.map((s) => {
                      const on = it.userIds.includes(s.userId);
                      return (
                        <li key={s.userId}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleItemUser(it, s.userId)}
                            aria-pressed={on}
                            data-deleg-person={s.userId}
                            className={`flex w-full min-h-[40px] items-center gap-2.5 rounded-lg px-2 text-left text-[13px] disabled:opacity-60 ${
                              on ? "font-bold text-teal-800" : "text-slate-700 hover:bg-slate-50"
                            }`}
                            style={on ? { background: "#e7f4f1" } : undefined}
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[12px] leading-none ${
                                on ? "bg-teal-600 text-white" : "border border-slate-300 bg-white"
                              }`}
                              data-deleg-check={on ? "on" : "off"}
                            >
                              {on ? "✓" : ""}
                            </span>
                            <span className="min-w-0 break-words">{labelOf(s)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 min-h-[18px] shrink-0 text-[11px]" aria-live="polite" data-deleg-saved>
                  {busy ? <span className="text-slate-500">保存しています…</span> : savedKey === it.key && !error ? <span className="text-teal-800">💾 保存しました（すぐに反映されます）</span> : error ? <span className="text-red-700">{error}</span> : null}
                </p>
                {/* 226 §3: ディープリサーチだけ、任された1人あたりの月の上限を決める */}
                {it.key === "deep-research" && (
                  <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2" data-dr-limit>
                    <label className="text-[11px] text-slate-700">
                      任された人1人あたりの月の上限
                      <input
                        type="number"
                        min={DEEP_RESEARCH_LIMIT_MIN}
                        max={DEEP_RESEARCH_LIMIT_MAX}
                        value={drInput}
                        disabled={busy}
                        onChange={(e) => setDrInput(e.target.value)}
                        className="ml-2 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm min-h-[36px]"
                        aria-label="ディープリサーチの月の上限"
                      />
                      <span className="ml-1 text-[11px] text-slate-600">回／月</span>
                    </label>
                    <button
                      type="button"
                      disabled={busy || normalizeLimit(drInput) === drLimit}
                      onClick={() => {
                        setSavedKey("");
                        void save({ deepResearchLimit: normalizeLimit(drInput) }).then(() => setSavedKey(it.key));
                      }}
                      data-dr-limit-save
                      className="rounded-full border border-teal-500 bg-teal-600 px-3 py-1.5 text-xs text-white min-h-[36px] disabled:opacity-40"
                    >
                      上限を保存
                    </button>
                    <span className="text-[11px] text-slate-500">
                      院長は上限なし。0 にすると、任された人は使えません。毎月1日（日本時間）に戻ります。
                    </span>
                  </div>
                )}
              </ItemPopover>
            );
          })()}
      </section>
    </div>
  );
}
