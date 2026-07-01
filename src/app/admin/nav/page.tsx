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

export default function AdminNavPage() {
  const [state, setState] = useState<EditState>(() => configToEdit(null));
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getContentObject<NavConfig>(NAV_CONFIG_KEY)
      .then((cfg) => {
        setState(configToEdit(cfg));
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
    setSaving(false);
    flash("既定の構成に戻しました");
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={importCurrent}>現在の構成を初期値として取り込む</Button>
        <Button variant="outline" size="sm" onClick={resetToDefault}>既定に戻す</Button>
        <Button variant="outline" size="sm" onClick={addCategory}>+ カテゴリを追加</Button>
      </div>

      <div className="space-y-4">
        {state.categories.map((cat, cIdx) => (
          <div
            key={cat.id}
            className={`rounded-lg border bg-white p-4 space-y-3 ${cat.hidden ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={cat.label}
                onChange={(e) => renameCategory(cIdx, e.target.value)}
                onBlur={() => persist(state)}
                className="max-w-[220px] font-bold"
              />
              <span className="text-xs text-muted-foreground">
                ({(state.itemsByCat[cat.id] ?? []).length}項目)
              </span>
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, -1)} disabled={cIdx === 0}>↑</Button>
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, 1)} disabled={cIdx === state.categories.length - 1}>↓</Button>
                <Button variant="outline" size="sm" onClick={() => toggleCategoryHidden(cIdx)}>
                  {cat.hidden ? "表示する" : "非表示"}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteCategory(cIdx)}>削除</Button>
              </div>
            </div>

            <ul className="space-y-2">
              {(state.itemsByCat[cat.id] ?? []).map((key, iIdx) => {
                const meta = state.itemMeta[key] ?? { hidden: false, labelOverride: "" };
                const list = state.itemsByCat[cat.id] ?? [];
                return (
                  <li
                    key={key}
                    className={`rounded-md border p-2 space-y-2 ${meta.hidden ? "bg-slate-50 opacity-70" : ""}`}
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
                <li className="text-xs text-muted-foreground px-1">このカテゴリに項目はありません</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
