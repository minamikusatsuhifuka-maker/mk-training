"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  getContentObject,
  saveContentObject,
  deleteContent,
} from "@/lib/content-store";
import {
  NAV_CONFIG_KEY,
  MASTER_ITEM_BY_KEY,
  GATED_ITEMS,
  GATED_ITEM_BY_KEY,
  isGatedKey,
  UNCATEGORIZED_ID,
  UNCATEGORIZED_LABEL,
  buildDefaultConfig,
  categoryLabelOf,
  isLinkKey,
  isSafeExternalUrl,
  linkIdOf,
  linkKeyOf,
  linkLabelOf,
  normalizeConfig,
  type NavConfig,
  type NavLink,
} from "@/lib/nav";
import { AdminBanner } from "@/components/AdminBanner";
import { AdminMenuGroupsEditor } from "@/components/admin/AdminMenuGroupsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isCategoryCollapsed,
  loadSidebarSettings,
  saveSidebarSettings,
  type SidebarSettings,
} from "@/lib/sidebar-accordion";

type EditCategory = { id: string; label: string; hidden: boolean };
type EditItemMeta = { hidden: boolean; labelOverride: string };
// 外部リンク（171）の編集内容。key（`link:<id>`）で itemsByCat の並びに載る＝
// 並び順・カテゴリ移動・非表示は既存のメニュー項目とまったく同じ操作で動く。
type EditLink = { label: string; url: string; icon: string };

type EditState = {
  categories: EditCategory[];
  itemsByCat: Record<string, string[]>;
  itemMeta: Record<string, EditItemMeta>;
  linkMeta: Record<string, EditLink>;
  /** 262: グループに入っていない「任された人にだけ出る項目」（スタッフの左のメニューのいちばん下に出る） */
  ungrouped: string[];
};

// 262: 「グループに入っていない項目」の置き場所を表す編集用の目印（保存はしない）
const UNGROUPED = "__ungrouped__";

/** 262: いちばん下の並びは今までの決まった順（GATED_ITEMS の順）＝スタッフの左のメニューと同じ */
function sortUngrouped(keys: string[]): string[] {
  const order = new Map(GATED_ITEMS.map((g, i) => [g.key as string, i]));
  return [...keys].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

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
  const linkMeta: Record<string, EditLink> = {};
  // items と links を order で混ぜてから並べる（nav.ts の normalizeConfig と同じ番号空間）
  type Row = { key: string; catId: string; order: number };
  const rows: Row[] = [];
  for (const it of norm.items) {
    rows.push({ key: it.key, catId: it.categoryId, order: it.order });
    itemMeta[it.key] = {
      hidden: !!it.hidden,
      labelOverride: it.labelOverride ?? "",
    };
  }
  for (const l of norm.links ?? []) {
    const key = linkKeyOf(l.id);
    rows.push({ key, catId: l.categoryId, order: l.order });
    itemMeta[key] = { hidden: !!l.hidden, labelOverride: "" };
    linkMeta[key] = { label: l.label, url: l.url, icon: l.icon ?? "" };
  }
  rows.sort((a, b) => a.order - b.order);
  for (const r of rows) {
    if (!itemsByCat[r.catId]) itemsByCat[r.catId] = [];
    itemsByCat[r.catId].push(r.key);
  }
  // 262: グループに置かれていない「任された人にだけ出る項目」
  const placed = new Set(Object.values(itemsByCat).flat());
  const ungrouped = GATED_ITEMS.map((g) => g.key as string).filter((k) => !placed.has(k));
  for (const k of ungrouped) itemMeta[k] = { hidden: false, labelOverride: "" };
  return { categories, itemsByCat, itemMeta, linkMeta, ungrouped };
}

function editToConfig(state: EditState): NavConfig {
  const categories = state.categories.map((c, i) => ({
    id: c.id,
    // 167 B-4: 空欄は既定名で保存する（blur を経ずに保存された場合の防衛）
    label: categoryLabelOf(c.id, c.label),
    order: i,
    hidden: c.hidden,
  }));
  const items: NavConfig["items"] = [];
  const links: NavLink[] = [];
  for (const c of state.categories) {
    (state.itemsByCat[c.id] ?? []).forEach((key, order) => {
      const meta = state.itemMeta[key] ?? { hidden: false, labelOverride: "" };
      if (isLinkKey(key)) {
        const l = state.linkMeta[key];
        if (!l) return; // 実体を失った孤児キーは保存しない
        links.push({
          id: linkIdOf(key),
          label: l.label.trim(),
          url: l.url.trim(),
          ...(l.icon.trim() ? { icon: l.icon.trim() } : {}),
          categoryId: c.id,
          order,
          hidden: meta.hidden,
        });
        return;
      }
      if (isGatedKey(key)) {
        // 262: 置き場所と並びだけを持つ（見られる人は各機能のサーバーの判定のまま）
        items.push({ key, categoryId: c.id, order, hidden: false });
        return;
      }
      items.push({
        key,
        categoryId: c.id,
        order,
        hidden: meta.hidden,
        ...(meta.labelOverride.trim() ? { labelOverride: meta.labelOverride.trim() } : {}),
      });
    });
  }
  return { categories, items, links };
}

function masterLabel(key: string): string {
  return MASTER_ITEM_BY_KEY.get(key)?.label ?? GATED_ITEM_BY_KEY.get(key)?.label ?? key;
}
function masterHref(key: string): string {
  return MASTER_ITEM_BY_KEY.get(key)?.href ?? GATED_ITEM_BY_KEY.get(key)?.href ?? key;
}

const cloneState = (s: EditState): EditState => ({
  categories: s.categories.map((c) => ({ ...c })),
  itemsByCat: Object.fromEntries(Object.entries(s.itemsByCat).map(([k, v]) => [k, [...v]])),
  itemMeta: Object.fromEntries(Object.entries(s.itemMeta).map(([k, v]) => [k, { ...v }])),
  linkMeta: Object.fromEntries(Object.entries(s.linkMeta).map(([k, v]) => [k, { ...v }])),
  ungrouped: [...s.ungrouped],
});

/**
 * 262: 項目を toCat の toIdx 番目へ移す（同じグループの中の並べ替えも、別のグループへの移動も）。
 * toIdx は「移す前の並び」での位置（その項目の前に入る）。並びの長さ以上なら末尾。
 * グループに入っていない所（UNGROUPED）へ戻せるのは、任された人にだけ出る項目だけ
 * （ほかの項目をそこへ置くと、どこにも出なくなるため）。
 */
function moveItemTo(s: EditState, key: string, fromCat: string, toCat: string, toIdx: number): EditState {
  if (toCat === UNGROUPED && !isGatedKey(key)) return s;
  const next = cloneState(s);
  const listOf = (catId: string): string[] =>
    catId === UNGROUPED ? next.ungrouped : (next.itemsByCat[catId] = next.itemsByCat[catId] ?? []);
  const from = listOf(fromCat);
  const fromIdx = from.indexOf(key);
  if (fromIdx < 0) return s;
  from.splice(fromIdx, 1);
  const to = listOf(toCat);
  let at = toIdx;
  if (fromCat === toCat && fromIdx < toIdx) at -= 1;
  to.splice(Math.max(0, Math.min(at, to.length)), 0, key);
  next.ungrouped = sortUngrouped(next.ungrouped);
  return next;
}

// 行の表示ラベル（外部リンクは登録内容から組み立てる）
function rowLabel(state: EditState, key: string): string {
  if (isLinkKey(key)) {
    const l = state.linkMeta[key];
    return l ? linkLabelOf(l) || "（表示名なし）" : key;
  }
  return masterLabel(key);
}

// ドラッグ中の対象（カテゴリの ⠿。項目は 262 で指でも動かせるドラッグに変えた＝ItemDrag）
type DragPayload = { type: "cat"; id: string };

// 262: 項目のドラッグ（Pointer Events＝マウス・指・ペンで同じ動き）。148 の DragSortList と同じ理由で HTML5 の draggable は使わない
type ItemDrag = { key: string; fromCat: string; label: string };
type DropTarget = { cat: string; idx: number; line: { top: number; left: number; width: number } };

/** 指・カーソルの位置から、落とす場所（グループと何番目か）と、示す線の位置を求める */
function findDropTarget(x: number, y: number, key: string): DropTarget | null {
  const zones = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-zone]"));
  const zone = zones.find((z) => {
    const r = z.getBoundingClientRect();
    return y >= r.top && y <= r.bottom && x >= r.left - 40 && x <= r.right + 40;
  });
  if (!zone) return null;
  const cat = zone.dataset.navZone ?? "";
  if (cat === UNGROUPED && !isGatedKey(key)) return null;
  const zr = zone.getBoundingClientRect();
  const rows = Array.from(zone.querySelectorAll<HTMLElement>("[data-nav-row]"));
  const left = zr.left + 16;
  const width = Math.max(40, zr.width - 32);
  if (rows.length === 0) {
    // 閉じているグループ・空のグループ：末尾に入れる（線はグループの下の端）
    return { cat, idx: Number.MAX_SAFE_INTEGER, line: { top: zr.bottom - 10, left, width } };
  }
  let idx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      idx = i;
      break;
    }
  }
  const top =
    idx < rows.length
      ? rows[idx].getBoundingClientRect().top - 5
      : rows[rows.length - 1].getBoundingClientRect().bottom + 3;
  return { cat, idx, line: { top, left, width } };
}

/** ドラッグ中に端へ寄せたとき動かす入れ物（管理画面の main。無ければ画面全体） */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

// 保存する前に画面を離れようとしたときの確かめ（今ある文）
const LEAVE_CONFIRM = "書きかけの内容（まだ保存していない入力）を破棄します。\n\nよろしいですか？";

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
  // 262: 保存した内容（「元に戻す」と、保存していない変更があるかの見分けに使う）
  const [savedCfg, setSavedCfg] = useState<NavConfig | null>(null);
  const [savedJson, setSavedJson] = useState<string>(() => JSON.stringify(editToConfig(configToEdit(null))));
  const dirty = connected && JSON.stringify(editToConfig(state)) !== savedJson;
  // 262: 項目のドラッグ
  const [itemDrag, setItemDrag] = useState<ItemDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // 166→167: サイドメニューの既定開閉（カテゴリごと）。
  // 旧形式（全体一括 mode）は loadSidebarSettings が読み出し時に全カテゴリへ展開して引き継ぎ、
  // ここで保存した時点でカテゴリ別の値に一本化される。
  const [sidebarSettings, setSidebarSettings] = useState<SidebarSettings>({
    collapsed: {},
    updatedAt: "",
  });
  const [savingSidebar, setSavingSidebar] = useState(false);
  useEffect(() => {
    loadSidebarSettings().then(setSidebarSettings).catch(() => {});
  }, []);
  const collapsedOf = (id: string) => isCategoryCollapsed(sidebarSettings, id);
  // 現在のカテゴリ一覧で実体化（旧形式の「全閉」もここでカテゴリ別の値になる）
  const materializeCollapsed = (): Record<string, boolean> =>
    Object.fromEntries(state.categories.map((c) => [c.id, collapsedOf(c.id)]));
  const persistCollapsed = async (collapsed: Record<string, boolean>) => {
    const prev = sidebarSettings;
    setSidebarSettings({ collapsed, updatedAt: prev.updatedAt });
    setSavingSidebar(true);
    const ok = await saveSidebarSettings(collapsed);
    setSavingSidebar(false);
    if (ok) {
      flash("保存しました（スタッフ側はリロードで反映されます）");
    } else {
      setSidebarSettings(prev);
      flash("保存に失敗しました");
    }
  };
  const toggleCategoryCollapsed = (id: string) => {
    const next = materializeCollapsed();
    next[id] = !next[id];
    persistCollapsed(next);
  };
  const setAllCollapsed = (collapsed: boolean) => {
    const next = Object.fromEntries(
      state.categories.map((c) => [c.id, collapsed])
    );
    persistCollapsed(next);
  };

  useEffect(() => {
    getContentObject<NavConfig>(NAV_CONFIG_KEY)
      .then((cfg) => {
        const edit = configToEdit(cfg);
        setState(edit);
        setSavedCfg(cfg);
        setSavedJson(JSON.stringify(editToConfig(edit)));
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
    const cfg = editToConfig(next);
    const ok = await saveContentObject(NAV_CONFIG_KEY, cfg);
    setConnected(ok);
    if (ok) {
      setHasSavedConfig(true);
      setSavedCfg(cfg);
      setSavedJson(JSON.stringify(editToConfig(configToEdit(cfg))));
    }
    flash(ok ? "保存しました（スタッフ側はリロードで反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setSaving(false);
  };

  // 262: 変えた内容は「💾 保存」を押すまでスタッフの左のメニューに出さない（1つずつの自動保存はやめた）
  const update = (next: EditState) => {
    setState(next);
  };

  const clone = cloneState;

  // 262: 保存した内容に戻す（保存していない変更を捨てる）
  const revertToSaved = () => {
    if (!confirm(LEAVE_CONFIRM)) return;
    setState(configToEdit(savedCfg));
  };

  // 262: 保存する前に画面を離れようとしたら知らせる（ブラウザを閉じる・再読み込み・アプリの中のリンク）
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!confirm(LEAVE_CONFIRM)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // 262: 項目のドラッグ（つかむのは ⠿ だけ。指でも動く）
  const startItemDrag = (e: ReactPointerEvent<HTMLElement>, key: string, fromCat: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setItemDrag({ key, fromCat, label: rowLabel(state, key) });
    setPointer({ x: e.clientX, y: e.clientY });
    setDropTarget(findDropTarget(e.clientX, e.clientY, key));
  };
  useEffect(() => {
    if (!itemDrag) return;
    let last = { x: 0, y: 0, set: false };
    let raf = 0;
    const scroller = scrollParentOf(document.querySelector<HTMLElement>("[data-nav-zone]"));
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY, set: true };
      setPointer({ x: e.clientX, y: e.clientY });
      setDropTarget(findDropTarget(e.clientX, e.clientY, itemDrag.key));
    };
    // 画面の上下の端に寄せたら、その向きに少しずつ動かす（長い一覧の遠くのグループへ移せるように）
    const tick = () => {
      if (last.set && scroller) {
        const edge = 70;
        const h = window.innerHeight;
        const dy = last.y < edge ? -Math.ceil((edge - last.y) / 5) : last.y > h - edge ? Math.ceil((last.y - (h - edge)) / 5) : 0;
        if (dy !== 0) {
          scroller.scrollBy(0, dy);
          setDropTarget(findDropTarget(last.x, last.y, itemDrag.key));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const finish = (e: PointerEvent, drop: boolean) => {
      const t = drop ? findDropTarget(e.clientX, e.clientY, itemDrag.key) : null;
      if (t) setState((s) => moveItemTo(s, itemDrag.key, itemDrag.fromCat, t.cat, t.idx));
      setItemDrag(null);
      setDropTarget(null);
      setPointer(null);
    };
    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setItemDrag(null);
        setDropTarget(null);
        setPointer(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = prevSelect;
    };
  }, [itemDrag]);

  // --- 外部リンク（171） ---
  const addLink = (catId: string) => {
    const next = clone(state);
    // IDは既存の最大番号＋1（時刻・乱数を使わない＝再描画で結果が揺れない）
    const used = Object.keys(next.linkMeta).map((k) => Number(linkIdOf(k).replace(/^l/, "")));
    const nextNo = used.reduce((m, n) => (Number.isFinite(n) && n > m ? n : m), 0) + 1;
    const key = linkKeyOf(`l${nextNo}`);
    next.linkMeta[key] = { label: "新しいリンク", url: "", icon: "🔗" };
    next.itemMeta[key] = { hidden: false, labelOverride: "" };
    next.itemsByCat[catId] = [...(next.itemsByCat[catId] ?? []), key];
    update(next);
    flash("外部リンクを追加しました（表示名とURLを入力してください）");
  };
  const setLinkField = (key: string, field: keyof EditLink, val: string) => {
    const next = clone(state);
    next.linkMeta[key] = {
      ...(next.linkMeta[key] ?? { label: "", url: "", icon: "" }),
      [field]: val,
    };
    setState(next); // persist on blur
  };
  const deleteLink = (catId: string, key: string) => {
    const name = rowLabel(state, key);
    if (!confirm(`外部リンク「${name}」を削除しますか？`)) return;
    const next = clone(state);
    next.itemsByCat[catId] = (next.itemsByCat[catId] ?? []).filter((k) => k !== key);
    delete next.linkMeta[key];
    delete next.itemMeta[key];
    update(next);
  };
  // 既定構成へ戻す系の操作で外部リンクを失わせないための復元（歯止め2）
  const keepLinks = (base: EditState, from: EditState): EditState => {
    const next: EditState = {
      ...base,
      itemMeta: { ...base.itemMeta },
      itemsByCat: Object.fromEntries(
        Object.entries(base.itemsByCat).map(([k, v]) => [k, [...v]])
      ),
      linkMeta: { ...from.linkMeta },
    };
    const catIds = new Set(next.categories.map((c) => c.id));
    for (const [catId, keys] of Object.entries(from.itemsByCat)) {
      for (const key of keys) {
        if (!isLinkKey(key) || !next.linkMeta[key]) continue;
        const to = catIds.has(catId) ? catId : UNCATEGORIZED_ID;
        if (!next.itemsByCat[to]) {
          next.itemsByCat[to] = [];
          if (!catIds.has(to)) {
            next.categories = [
              ...next.categories,
              { id: UNCATEGORIZED_ID, label: UNCATEGORIZED_LABEL, hidden: false },
            ];
            catIds.add(to);
          }
        }
        next.itemsByCat[to].push(key);
        next.itemMeta[key] = from.itemMeta[key] ?? { hidden: false, labelOverride: "" };
      }
    }
    return next;
  };

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
  // 移す先のグループの末尾へ（262: グループに入っていない所＝UNGROUPED との行き来も）
  const changeItemCategory = (key: string, fromCat: string, toCat: string) => {
    if (fromCat === toCat) return;
    update(moveItemTo(state, key, fromCat, toCat, Number.MAX_SAFE_INTEGER));
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
  // 項目: 262 で ⠿ をつかむドラッグ（startItemDrag）に変えた。
  // カテゴリ: ヘッダの ⠿ をドラッグ→別カテゴリ枠へドロップで並び替え。
  const dropCategoryAt = (toCat: string) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
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
    // 171: 既定の取り込みでも、管理画面から登録した外部リンクは残す
    const next = keepLinks(configToEdit(buildDefaultConfig()), state);
    update(next);
    flash("現在の構成（既定）を取り込みました（外部リンクは維持）");
  };
  const resetToDefault = async () => {
    if (!confirm("設定を削除して既定の構成に戻しますか？（カスタマイズと、登録した外部リンクは失われます）")) return;
    setSaving(true);
    await deleteContent(NAV_CONFIG_KEY);
    setState(configToEdit(null));
    setSavedCfg(null);
    setSavedJson(JSON.stringify(editToConfig(configToEdit(null))));
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
    const merged: EditState = {
      categories: base.categories.map((c) => {
        const cur = state.categories.find((x) => x.id === c.id);
        return cur ? { ...c, label: cur.label, hidden: cur.hidden } : c;
      }),
      itemsByCat: base.itemsByCat,
      itemMeta: { ...base.itemMeta, ...state.itemMeta },
      linkMeta: state.linkMeta,
      ungrouped: base.ungrouped,
    };
    // 171: 既定の配置に戻しても外部リンクは元のカテゴリに残す
    const next = keepLinks(merged, state);
    update(next);
    flash("既定の配置を反映しました（表示/名前の設定・外部リンクは維持）");
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
            スタッフポータルのカテゴリ・メニューの並び・所属・表示/非表示・表示名を編集できます。変更は「💾 保存」を押すと全員の左のメニューに反映されます（スタッフ側はリロードで反映されます）。保存するまでは、スタッフの画面は変わりません。
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
      </div>

      {/* 262: 保存と「元に戻す」は、下へ動かしても上に残す（長い一覧の途中からでも押せるように・1行に収まる2つだけ） */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-background/95 px-1 py-2 backdrop-blur-sm" data-nav-actions>
        <Button variant="outline" size="sm" onClick={revertToSaved} disabled={!dirty || saving} data-nav-revert>元に戻す</Button>
        <Button size="sm" onClick={() => persist(state)} disabled={saving} data-nav-save>💾 保存</Button>
        {dirty && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" data-nav-dirty>
            まだ保存していない入力があります
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        並び替えはドラッグ&ドロップ（項目の ⠿・カテゴリの ⠿）でも、↑↓ボタンでもできます。項目は別のカテゴリへも移せます（落とす場所に線が出ます）。「カテゴリ移動」の欄でも移せます。
      </p>

      {/* 171: 外部リンク */}
      <div className="rounded-lg border bg-white p-4 space-y-1.5">
        <h2 className="text-sm font-bold text-slate-800">🔗 外部サイトへのリンク</h2>
        <p className="text-xs text-slate-600">
          各カテゴリの下にある「＋ 外部リンクを追加」から、外部サイトへのリンクをメニューに並べられます。表示名・URL・アイコンを入力し、並び順とカテゴリは通常のメニュー項目と同じように変更できます。
        </p>
        <p className="text-xs text-slate-600">
          スタッフ側では<strong>新しいタブで開き、項目名の横に ↗ が付きます</strong>（アプリ内のページと区別できるようにするため）。URLは
          <code className="mx-1 rounded bg-slate-100 px-1">https://</code>
          で始まるもののみ登録できます。
        </p>
        <p className="text-xs text-amber-700">
          ⚠️ 院内の個人情報を扱うものは、外部リンクではなくアプリ内の機能として作ってください（リンク先の安全性はこのアプリでは守れません）。
        </p>
      </div>

      {/* 166→167: サイドメニューの既定開閉（カテゴリごと） */}
      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="text-sm font-bold text-slate-800">📂 サイドメニューの既定の開閉（カテゴリごと）</h2>
        <p className="text-xs text-slate-600">
          スタッフ側サイドメニューで、各カテゴリを開いた状態で表示するか、見出しだけ表示するかをカテゴリごとに選べます（全スタッフ共通・既定はすべて「開いた状態」）。
          設定は下の各カテゴリの「▾ 既定:開／▸ 既定:閉」ボタンで切り替えます。
          カテゴリ見出しのタップでいつでも開閉でき、閉じる設定でも現在開いているページのカテゴリは開いた状態になります。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAllCollapsed(false)} disabled={savingSidebar}>
            ▾ すべて開くにする
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllCollapsed(true)} disabled={savingSidebar}>
            ▸ すべて閉じるにする
          </Button>
        </div>
        <p className="text-xs text-amber-700">
          ⚠️ 閉じる設定にしたカテゴリは、初めて使う人にはメニューの中身が見えなくなります。スタッフが機能を把握して慣れてきてから閉じる設定に切り替えることをおすすめします。
        </p>
      </div>

      <div className="space-y-4">
        {state.categories.map((cat, cIdx) => (
          <div
            key={cat.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              dropCategoryAt(cat.id);
            }}
            data-nav-zone={cat.id}
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
                onBlur={() => {
                  // 167 B-4: 空欄のまま確定したら既定名に戻す（見出しが消えるのを防ぐ）
                  if (!cat.label.trim()) {
                    const next = clone(state);
                    next.categories[cIdx].label = categoryLabelOf(cat.id, "");
                    update(next);
                  }
                }}
                className="max-w-[220px] font-bold"
              />
              <span className="text-xs text-muted-foreground">
                ({(state.itemsByCat[cat.id] ?? []).length}項目)
              </span>
              {collapsed[cat.id] && (
                <span className="text-[11px] text-muted-foreground truncate max-w-[380px]">
                  {(state.itemsByCat[cat.id] ?? [])
                    .map((key) => state.itemMeta[key]?.labelOverride?.trim() || rowLabel(state, key))
                    .join(" / ")}
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, -1)} disabled={cIdx === 0}>↑</Button>
                <Button variant="outline" size="sm" onClick={() => moveCategory(cIdx, 1)} disabled={cIdx === state.categories.length - 1}>↓</Button>
                {/* 167: スタッフ側サイドメニューでの既定の開閉（保存はカテゴリ別の値のみ） */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleCategoryCollapsed(cat.id)}
                  disabled={savingSidebar}
                  title="スタッフ側サイドメニューで、このカテゴリを既定で開いておくか・閉じておくか"
                >
                  {collapsedOf(cat.id) ? "▸ 既定:閉" : "▾ 既定:開"}
                </Button>
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
                const link = isLinkKey(key) ? state.linkMeta[key] : undefined;
                if (link) {
                  const urlOk = isSafeExternalUrl(link.url);
                  return (
                    <li
                      key={key}
                      data-nav-row={key}
                      className={`rounded-md border p-2 space-y-2 ${meta.hidden ? "bg-slate-50 opacity-70" : "bg-sky-50/40"} ${itemDrag?.key === key ? "opacity-40" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <DragHandle onPointerDown={(e) => startItemDrag(e, key, cat.id)} />
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                          外部リンク ↗
                        </span>
                        <span className="text-sm font-medium text-slate-700">
                          {linkLabelOf(link) || "（表示名なし）"}
                        </span>
                        {!urlOk && (
                          <span className="text-[11px] text-red-600">
                            ⚠ https:// で始まるURLを入力してください（この状態ではメニューに表示されません）
                          </span>
                        )}
                        <div className="ml-auto flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => moveItem(cat.id, iIdx, -1)} disabled={iIdx === 0}>↑</Button>
                          <Button variant="outline" size="sm" onClick={() => moveItem(cat.id, iIdx, 1)} disabled={iIdx === list.length - 1}>↓</Button>
                          <Button variant="outline" size="sm" onClick={() => toggleItemHidden(key)}>
                            {meta.hidden ? "表示する" : "非表示"}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteLink(cat.id, key)}>削除</Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-muted-foreground">アイコン:</label>
                        <Input
                          value={link.icon}
                          onChange={(e) => setLinkField(key, "icon", e.target.value)}
                          placeholder="🔗"
                          className="w-[64px] h-8 text-xs"
                        />
                        <label className="text-[11px] text-muted-foreground">表示名:</label>
                        <Input
                          value={link.label}
                          onChange={(e) => setLinkField(key, "label", e.target.value)}
                          placeholder="チームボード"
                          className="max-w-[180px] h-8 text-xs"
                        />
                        <label className="text-[11px] text-muted-foreground">URL:</label>
                        <Input
                          value={link.url}
                          onChange={(e) => setLinkField(key, "url", e.target.value)}
                          onBlur={() => {
                            if (link.url.trim() && !isSafeExternalUrl(link.url)) {
                              flash("https:// で始まるURLのみ登録できます");
                            }
                          }}
                          placeholder="https://example.com/board"
                          className={`max-w-[320px] h-8 text-xs ${link.url.trim() && !urlOk ? "border-red-400" : ""}`}
                        />
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
                        <span className="text-[11px] text-muted-foreground">
                          新しいタブで開きます（スタッフ側では ↗ が付きます）
                        </span>
                      </div>
                    </li>
                  );
                }
                if (isGatedKey(key)) {
                  return (
                    <GatedRow
                      key={key}
                      itemKey={key}
                      catId={cat.id}
                      categories={state.categories}
                      dragging={itemDrag?.key === key}
                      onPointerDown={(e) => startItemDrag(e, key, cat.id)}
                      onUp={() => moveItem(cat.id, iIdx, -1)}
                      onDown={() => moveItem(cat.id, iIdx, 1)}
                      upDisabled={iIdx === 0}
                      downDisabled={iIdx === list.length - 1}
                      onChangeCategory={(to) => changeItemCategory(key, cat.id, to)}
                    />
                  );
                }
                return (
                  <li
                    key={key}
                    data-nav-row={key}
                    className={`rounded-md border p-2 space-y-2 ${meta.hidden ? "bg-slate-50 opacity-70" : ""} ${itemDrag?.key === key ? "opacity-40" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DragHandle onPointerDown={(e) => startItemDrag(e, key, cat.id)} />
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
            {!collapsed[cat.id] && (
              <div className="pt-1">
                {/* 171: 外部サイトへのリンクをこのカテゴリに追加する */}
                <Button variant="outline" size="sm" onClick={() => addLink(cat.id)}>
                  ＋ 外部リンクを追加
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 262: グループに入っていない項目（任された人にだけ出る項目。スタッフの左のメニューのいちばん下に出る） */}
      <div className="rounded-lg border border-dashed bg-white p-4 space-y-3" data-nav-zone={UNGROUPED}>
        <div>
          <h2 className="text-sm font-bold text-slate-800">グループに入っていない項目</h2>
          <p className="mt-1 text-xs text-slate-600">
            任された人にだけ出る項目です。ここにある項目は、左のメニューのいちばん下に出ます。カテゴリへ移すと、そのカテゴリの中に出ます。どこに置いても、見られる人は変わりません。
          </p>
        </div>
        <ul className="space-y-2">
          {state.ungrouped.map((key) => (
            <GatedRow
              key={key}
              itemKey={key}
              catId={UNGROUPED}
              categories={state.categories}
              dragging={itemDrag?.key === key}
              onPointerDown={(e) => startItemDrag(e, key, UNGROUPED)}
              onChangeCategory={(to) => changeItemCategory(key, UNGROUPED, to)}
            />
          ))}
          {state.ungrouped.length === 0 && (
            <li className="text-xs text-muted-foreground px-1">このカテゴリに項目はありません（ここに項目をドラッグで移動できます）</li>
          )}
        </ul>
      </div>

      {/* 262: ドラッグ中の、落とす場所の線と、つかんでいる項目の名前 */}
      {itemDrag && dropTarget && (
        <div
          aria-hidden="true"
          data-nav-drop-line
          className="pointer-events-none fixed z-50 h-[3px] rounded-full bg-teal-500"
          style={{ top: dropTarget.line.top, left: dropTarget.line.left, width: dropTarget.line.width }}
        >
          <span className="absolute -left-1.5 -top-[4px] h-[11px] w-[11px] rounded-full border-2 border-teal-500 bg-white" />
        </div>
      )}
      {itemDrag && pointer && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-md border border-teal-300 bg-white/95 px-2 py-1 text-sm font-medium text-slate-700 shadow-lg"
          style={{ top: pointer.y + 12, left: pointer.x + 12 }}
        >
          {itemDrag.label}
        </div>
      )}

      {/* 241: 管理画面の左のメニューのグループ（院長だけに出る） */}
      <AdminMenuGroupsEditor />
    </div>
  );
}

/** 262: 項目をつかむ所（⠿）。ここだけをつかむ＝行のほかの所では画面を指で動かせる */
function DragHandle({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="ドラッグで並び替え"
      title="ドラッグで並び替え・別のカテゴリへ移す"
      onPointerDown={onPointerDown}
      className="flex h-8 w-7 shrink-0 cursor-grab select-none items-center justify-center rounded text-lg leading-none text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
      style={{ touchAction: "none" }}
      data-nav-handle
    >
      ⠿
    </span>
  );
}

/** 262: 任された人にだけ出る項目の行（並び・置き場所だけを変えられる。見られる人は変えない） */
function GatedRow({
  itemKey,
  catId,
  categories,
  dragging,
  onPointerDown,
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  onChangeCategory,
}: {
  itemKey: string;
  catId: string;
  categories: EditCategory[];
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onUp?: () => void;
  onDown?: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  onChangeCategory: (to: string) => void;
}) {
  return (
    <li data-nav-row={itemKey} className={`rounded-md border border-violet-200 bg-violet-50/40 p-2 space-y-2 ${dragging ? "opacity-40" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <DragHandle onPointerDown={onPointerDown} />
        <span className="text-sm font-medium text-slate-700">{masterLabel(itemKey)}</span>
        <span className="text-[11px] text-muted-foreground">{masterHref(itemKey)}</span>
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">任された人にだけ出ます</span>
        {onUp && onDown && (
          <div className="ml-auto flex gap-1">
            <Button variant="outline" size="sm" onClick={onUp} disabled={upDisabled}>↑</Button>
            <Button variant="outline" size="sm" onClick={onDown} disabled={downDisabled}>↓</Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted-foreground">カテゴリ移動:</label>
        <select
          value={catId}
          onChange={(e) => onChangeCategory(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.hidden ? "（非表示）" : ""}
            </option>
          ))}
          <option value={UNGROUPED}>グループに入っていない項目</option>
        </select>
      </div>
    </li>
  );
}
