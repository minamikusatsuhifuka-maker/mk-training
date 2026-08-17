"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getContentObject,
  saveContentObject,
  deleteContent,
} from "@/lib/content-store";
import {
  NAV_CONFIG_KEY,
  MASTER_ITEM_BY_KEY,
  UNCATEGORIZED_ID,
  UNCATEGORIZED_LABEL,
  buildDefaultConfig,
  normalizeConfig,
  type NavConfig,
} from "@/lib/nav";
import { AdminBanner } from "@/components/AdminBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadSidebarModeStore,
  saveSidebarMode,
  type SidebarMode,
} from "@/lib/sidebar-accordion";

type EditCategory = { id: string; label: string; hidden: boolean };
type EditItemMeta = { hidden: boolean; labelOverride: string };

type EditState = {
  categories: EditCategory[];
  itemsByCat: Record<string, string[]>;
  itemMeta: Record<string, EditItemMeta>;
};

function configToEdit(cfg: NavConfig | null): EditState {
  const norm = normalizeConfig(cfg);
  const categories: EditCategory[] = norm.categories.map((c) => ({
    id: c.id,
    label: c.label,
    hidden: !!c.hidden,
  }));
  const itemsByCat: Record<string, string[]> = {};
  for (const c of categories) itemsByCat[c.id] = [];
  const itemMeta: Record<string, EditItemMeta> = {};
  for (const it of norm.items) {
    if (!itemsByCat[it.categoryId]) itemsByCat[it.categoryId] = [];
    itemsByCat[it.categoryId].push(it.key);
    itemMeta[it.key] = {
      hidden: !!it.hidden,
      labelOverride: it.labelOverride ?? "",
    };
  }
  return { categories, itemsByCat, itemMeta };
}

function editToConfig(state: EditState): NavConfig {
  const categories = state.categories.map((c, i) => ({
    id: c.id,
    label: c.label,
    order: i,
    hidden: c.hidden,
  }));
  const items: NavConfig["items"] = [];
  for (const c of state.categories) {
    (state.itemsByCat[c.id] ?? []).forEach((key, order) => {
      const meta = state.itemMeta[key] ?? { hidden: false, labelOverride: "" };
      items.push({
        key,
        categoryId: c.id,
        order,
        hidden: meta.hidden,
        ...(meta.labelOverride.trim() ? { labelOverride: meta.labelOverride.trim() } : {}),
      });
    });
  }
  return { categories, items };
}

function masterLabel(key: string): string {
  return MASTER_ITEM_BY_KEY.get(key)?.label ?? key;
}
function masterHref(key: string): string {
  return MASTER_ITEM_BY_KEY.get(key)?.href ?? key;
}

// ドラッグ中の対象（項目 or カテゴリ）
type DragPayload =
  | { type: "item"; key: string; fromCat: string }
  | { type: "cat"; id: string };

export default function AdminNavPage() {
  const [state, setState] = useState<EditState>(() => configToEdit(null));
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // カスタム構成が保存済みか（既定構成の変更が自動反映されない旨の注意表示に使う）
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  // グループの折りたたみ（項目数が多いため既定は折りたたみ）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);
  const dragRef = useRef<DragPayload | null>(null);

  // 166: サイドメニューの既定表示（すべて開く／すべて閉じる）
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("open");
  const [savingSidebarMode, setSavingSidebarMode] = useState(false);
  useEffect(() => {
    loadSidebarModeStore()
      .then((store) => setSidebarMode(store.mode))
      .catch(() => {});
  }, []);
  const changeSidebarMode = async (mode: SidebarMode) => {
    const prev = sidebarMode;
    setSidebarMode(mode);
    setSavingSidebarMode(true);
    const ok = await saveSidebarMode(mode);
    setSavingSidebarMode(false);
    if (ok) {
      flash("保存しました（スタッフ側はリロードで反映されます）");
    } else {
      setSidebarMode(prev);
      flash("保存に失敗しました");
    }
  };

  useEffect(() => {
    getContentObject<NavConfig>(NAV_CONFIG_KEY)
      .then((cfg) => {
        setState(configToEdit(cfg));
        setHasSavedConfig(!!cfg);
        setConnected(true);
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  const persist = async (next: EditState) => {
    setSaving(true);
    const ok = await saveContentObject(NAV_CONFIG_KEY, editToConfig(next));
    setConnected(ok);
    if (ok) setHasSavedConfig(true);
    flash(ok ? "保存しました（スタッフ側はリロードで反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setSaving(false);
  };

  const update = (next: EditState, doPersist = true) => {
    setState(next);
    if (doPersist) persist(next);
  };

  const clone = (s: EditState): EditState => ({
    categories: s.categories.map((c) => ({ ...c })),
    itemsByCat: Object.fromEntries(Object.entries(s.itemsByCat).map(([k, v]) => [k, [...v]])),
    itemMeta: Object.fromEntries(Object.entries(s.itemMeta).map(([k, v]) => [k, { ...v }])),
  });

  // --- category ops ---
  const moveCategory = (idx: number, dir: -1 | 1) => {
    const t = idx + dir;
    if (t < 0 || t >= state.categories.length) return;
    const next = clone(state);
    [next.categories[idx], next.categories[t]] = [next.categories[t], next.categories[idx]];
    update(next);
  };
  const renameCategory = (idx: number, label: string) => {
    const next = clone(state);
    next.categories[idx].label = label;
    setState(next); // persist on blur
  };
  const toggleCategoryHidden = (idx: number) => {
    const next = clone(state);
    next.categories[idx].hidden = !next.categories[idx].hidden;
    update(next);
  };
  const addCategory = () => {
    const next = clone(state);
    const id = `cat_${Date.now()}`;
    next.categories.push({ id, label: "新しいカテゴリ", hidden: false });
    next.itemsByCat[id] = [];
    update(next);
  };
  const deleteCategory = (idx: number) => {
    const next = clone(state);
    const cat = next.categories[idx];
    const orphan = next.itemsByCat[cat.id] ?? [];
    if (orphan.length > 0) {
      // 未分類カテゴリへ退避（無ければ作成）
      let uncat = next.categories.find((c) => c.id === UNCATEGORIZED_ID);
      if (!uncat) {
        uncat = { id: UNCATEGORIZED_ID, label: UNCATEGORIZED_LABEL, hidden: false };
        next.categories.push(uncat);
        next.itemsByCat[UNCATEGORIZED_ID] = next.itemsByCat[UNCATEGORIZED_ID] ?? [];
      }
      next.itemsByCat[UNCATEGORIZED_ID] = [...(next.itemsByCat[UNCATEGORIZED_ID] ?? []), ...orphan];
    }
    delete next.itemsByCat[cat.id];
    next.categories = next.categories.filter((_, i) => i !== idx);
    update(next);
  };

  // --- item ops ---
  const moveItem = (catId: string, idx: number, dir: -1 | 1) => {
    const list = state.itemsByCat[catId] ?? [];
    const t = idx + dir;
    if (t < 0 || t >= list.length) return;
    const next = clone(state);
    const arr = next.itemsByCat[catId];
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    update(next);
  };
  const changeItemCategory = (key: string, fromCat: string, toCat: string) => {
    if (fromCat === toCat) return;
    const next = clone(state);
    next.itemsByCat[fromCat] = (next.itemsByCat[fromCat] ?? []).filter((k) => k !== key);
    next.itemsByCat[toCat] = [...(next.itemsByCat[toCat] ?? []), key];
    update(next);
  };
  const toggleItemHidden = (key: string) => {
    const next = clone(state);
    next.itemMeta[key] = {
      ...(next.itemMeta[key] ?? { hidden: false, labelOverride: "" }),
      hidden: !next.itemMeta[key]?.hidden,
    };
    update(next);
  };
  const setLabelOverride = (key: string, val: string) => {
    const next = clone(state);
    next.itemMeta[key] = {
      ...(next.itemMeta[key] ?? { hidden: false, labelOverride: "" }),
      labelOverride: val,
    };
    setState(next); // persist on blur
  };

  // --- drag & drop ---
  // 項目: 行をドラッグ→別の行（前に挿入）またはカテゴリ枠（末尾に追加）へドロップ。
  // カテゴリ: ヘッダの ⠿ をドラッグ→別カテゴリ枠へドロップで並び替え。
  const dropItemAt = (toCat: string, toIdx: number | null) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.type === "item") {
      const next = clone(state);
      const from = next.itemsByCat[d.fromCat] ?? [];
      const fromIdx = from.indexOf(d.key);
      if (fromIdx < 0) return;
      from.splice(fromIdx, 1);
      const to = (next.itemsByCat[toCat] = next.itemsByCat[toCat] ?? []);
      let insertAt = toIdx === null ? to.length : toIdx;
      if (d.fromCat === toCat && toIdx !== null && fromIdx < toIdx) insertAt -= 1;
      to.splice(Math.max(0, Math.min(insertAt, to.length)), 0, d.key);
      update(next);
      return;
    }
    // カテゴリのドロップ → toCat の位置へ移動
    const next = clone(state);
    const fromIdx = next.categories.findIndex((c) => c.id === d.id);
    const toCatIdx = next.categories.findIndex((c) => c.id === toCat);
    if (fromIdx < 0 || toCatIdx < 0 || fromIdx === toCatIdx) return;
    const [moved] = next.categories.splice(fromIdx, 1);
    next.categories.splice(toCatIdx, 0, moved);
    update(next);
  };

  // --- global ops ---
  const importCurrent = () => {
    const next = configToEdit(buildDefaultConfig());
    update(next);
    flash("現在の構成（既定）を取り込みました");
  };
  const resetToDefault = async () => {
    if (!confirm("設定を削除して既定の構成に戻しますか？（カスタマイズは失われます）")) return;
    setSaving(true);
    await deleteContent(NAV_CONFIG_KEY);
    setState(configToEdit(null));
    setHasSavedConfig(false);
    setSaving(false);
    flash("既定の構成に戻しました");
  };
  // 既定の配置（グループ・並び順）を反映しつつ、非表示・表示名の上書き・グループ名変更は維持する。
  // 「既定構成が更新されたがカスタム保存が優先されて反映されない」ケースの救済用。
  const applyDefaultPlacement = () => {
    if (
      !confirm(
        "メニューの配置（所属グループ・並び順）を最新の既定に合わせますか？\n（非表示設定・表示名の上書き・グループ名の変更は維持されます）"
      )
    ) {
      return;
    }
    const base = configToEdit(buildDefaultConfig());
    const next: EditState = {
      categories: base.categories.map((c) => {
        const cur = state.categories.find((x) => x.id === c.id);
        return cur ? { ...c, label: cur.label, hidden: cur.hidden } : c;
      }),
      itemsByCat: base.itemsByCat,
      itemMeta: { ...base.itemMeta, ...state.itemMeta },
    };
    update(next);
    flash("既定の配置を反映しました（表示/名前の設定は維持）");
  };

  return (
    <div className="max-w-4xl space-y-4">
      <AdminBanner connected={connected} />
      {msg && (
        <div className={`rounded-md px-4 py-2 text-sm ${msg.startsWith("保存") || msg.includes("取り込み") || msg.includes("戻しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {msg}
        </div>
      )}
      {saving && <div className="text-sm text-muted-foreground animate-pulse">保存中...</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🧭 サイドバー構成の管理</h1>
          <p className="text-sm text-slate-600 mt-1">
            スタッフポータルのカテゴリ・メニューの並び・所属・表示/非表示・表示名を編集できます。変更は自動保存され、スタッフ側はリロードで反映されます。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="outline" size="sm">スタッフ画面を見る</Button>
          </Link>
        </div>
      </div>

      {hasSavedConfig && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          ⚠️
          カスタム構成を保存済みです。アプリ更新による既定構成の変更（新しい既定の並びなど）は自動では反映されません。最新の既定を反映するには「既定の配置を反映」または「既定に戻す」を使うか、手動で調整してください（新しく追加されたページ自体は自動で既定グループ末尾に表示されます）。
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={importCurrent}>現在の構成を初期値として取り込む</Button>
        <Button variant="outline" size="sm" onClick={applyDefaultPlacement}>⟲ 既定の配置を反映（表示/名前設定は維持）</Button>
        <Button variant="outline" size="sm" onClick={resetToDefault}>既定に戻す</Button>
        <Button variant="outline" size="sm" onClick={addCategory}>+ カテゴリを追加</Button>
        <Button size="sm" onClick={() => persist(state)} disabled={saving}>💾 保存</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        並び替えはドラッグ&ドロップ（項目の行・カテゴリの ⠿）でも、↑↓ボタンでもできます。変更は自動保存されます。
      </p>

      {/* 166: サイドメニューの既定表示（アコーディオン） */}
      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-sm font-bold text-slate-800">📂 サイドメニューの既定表示</h2>
        <p className="text-xs text-slate-600">
          スタッフ側サイドメニューのカテゴリを、開いた状態で表示するか、見出しだけ表示するかを選びます（全スタッフ共通・カテゴリ見出しのタップでいつでも開閉できます）。
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="sidebar-mode"
              checked={sidebarMode === "open"}
              onChange={() => changeSidebarMode("open")}
              disabled={savingSidebarMode}
            />
            すべて開く（既定）
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="sidebar-mode"
              checked={sidebarMode === "closed"}
              onChange={() => changeSidebarMode("closed")}
              disabled={savingSidebarMode}
            />
            すべて閉じる（カテゴリ見出しのみ表示。現在ページのカテゴリは開いたまま）
          </label>
        </div>
        <p className="text-xs text-amber-700">
          ⚠️ 「すべて閉じる」にすると、初めて使う人にはメニューの中身が見えなくなります。スタッフが機能を把握して慣れてきてから切り替えることをおすすめします。
        </p>
      </div>

      <div className="space-y-4">
        {state.categories.map((cat, cIdx) => (
          <div
            key={cat.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              dropItemAt(cat.id, null);
            }}
            className={`rounded-lg border bg-white p-4 space-y-3 ${cat.hidden ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                draggable
                onDragStart={() => {
                  dragRef.current = { type: "cat", id: cat.id };
                }}
                className="cursor-grab select-none text-slate-400 px-1"
                title="ドラッグでカテゴリを並び替え"
              >
                ⠿
              </span>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }))
                }
                className="text-sm text-slate-500 w-6"
                title={collapsed[cat.id] ? "展開" : "折りたたむ"}
              >
                {collapsed[cat.id] ? "▸" : "▾"}
              </button>
              <Input
                value={cat.label}
                onChange={(e) => renameCategory(cIdx, e.target.value)}
                onBlur={() => persist(state)}
                className="max-w-[220px] font-bold"
              />
              <span className="text-xs text-muted-foreground">
                ({(state.itemsByCat[cat.id] ?? []).length}項目)
              </span>
              {collapsed[cat.id] && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[380px]">
                  {(state.itemsByCat[cat.id] ?? [])
                    .map((key) => state.itemMeta[key]?.labelOverride?.trim() || masterLabel(key))
                    .join(" / ")}
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, -1)} disabled={cIdx === 0}>↑</Button>
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, 1)} disabled={cIdx === state.categories.length - 1}>↓</Button>
                <Button variant="outline" size="sm" onClick={() => toggleCategoryHidden(cIdx)}>
                  {cat.hidden ? "表示する" : "非表示"}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteCategory(cIdx)}>削除</Button>
              </div>
            </div>

            {!collapsed[cat.id] && (
            <ul className="space-y-2">
              {(state.itemsByCat[cat.id] ?? []).map((key, iIdx) => {
                const meta = state.itemMeta[key] ?? { hidden: false, labelOverride: "" };
                const list = state.itemsByCat[cat.id] ?? [];
                return (
                  <li
                    key={key}
                    draggable
                    onDragStart={() => {
                      dragRef.current = { type: "item", key, fromCat: cat.id };
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dropItemAt(cat.id, iIdx);
                    }}
                    className={`rounded-md border p-2 space-y-2 cursor-grab ${meta.hidden ? "bg-slate-50 opacity-70" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{masterLabel(key)}</span>
                      <span className="text-[11px] text-muted-foreground">{masterHref(key)}</span>
                      <div className="ml-auto flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => moveItem(cat.id, iIdx, -1)} disabled={iIdx === 0}>↑</Button>
                        <Button variant="outline" size="sm" onClick={() => moveItem(cat.id, iIdx, 1)} disabled={iIdx === list.length - 1}>↓</Button>
                        <Button variant="outline" size="sm" onClick={() => toggleItemHidden(key)}>
                          {meta.hidden ? "表示する" : "非表示"}
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[11px] text-muted-foreground">カテゴリ移動:</label>
                      <select
                        value={cat.id}
                        onChange={(e) => changeItemCategory(key, cat.id, e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {state.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                            {c.hidden ? "（非表示）" : ""}
                          </option>
                        ))}
                      </select>
                      <label className="text-[11px] text-muted-foreground ml-2">表示名の上書き:</label>
                      <Input
                        value={meta.labelOverride}
                        onChange={(e) => setLabelOverride(key, e.target.value)}
                        onBlur={() => persist(state)}
                        placeholder={masterLabel(key)}
                        className="max-w-[220px] h-8 text-xs"
                      />
                    </div>
                  </li>
                );
              })}
              {(state.itemsByCat[cat.id] ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground px-1">
                  このカテゴリに項目はありません（ここに項目をドラッグで移動できます）
                </li>
              )}
            </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
