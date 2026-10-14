"use client";

// 管理画面のメニューのグループを決める欄（指示書241 §3）—「🧭 サイドバー構成」の中・院長だけ
// できること：グループを作る（追加）・名前を変える（絵文字も可）・消す（削除。中のメニューは「その他」へ）・
//   グループの順番（↑↓）・メニューを別のグループへ移す・グループの中の順番（↑↓）→「保存」で左のメニューにすぐ反映。
// ボタンの文は、アプリにすでにある「追加」「保存」「削除」「↑」「↓」を使う。
// 保存先は content_store（admin_menu_groups・書けるのは院長だけ＝サーバーでも断る）。

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_ITEMS } from "@/lib/admin-items";
import { loadPortalObject, savePortalObject } from "@/lib/portal-store";
import {
  ADMIN_MENU_GROUPS_KEY,
  ADMIN_MENU_UPDATED_EVENT,
  EXTRA_MENU_ITEMS,
  OTHER_GROUP_ID,
  TOP_MENU_KEY,
  addGroup,
  deleteGroup,
  editableGroups,
  moveGroup,
  moveItemToGroup,
  moveItemWithin,
  normalizeAdminMenuConfig,
  renameGroup,
  type AdminMenuConfig,
  type MenuItemLike,
} from "@/lib/admin-menu-groups";

/** 院長が並べられる、すべてのメニュー（ダッシュボードはいちばん上に固定なので除く） */
const ALL_ITEMS: MenuItemLike[] = [
  ...ADMIN_ITEMS.filter((i) => !i.hidden && i.key !== TOP_MENU_KEY).map((i) => ({ key: i.key, label: i.label, href: i.href })),
  ...EXTRA_MENU_ITEMS,
];
const labelOf = (key: string) => ALL_ITEMS.find((i) => i.key === key)?.label ?? key;

export function AdminMenuGroupsEditor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [cfg, setCfg] = useState<AdminMenuConfig | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/my-items", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: { isAdmin?: boolean }) => {
        if (!alive || j.isAdmin !== true) return;
        setIsAdmin(true);
        return loadPortalObject<unknown>(ADMIN_MENU_GROUPS_KEY, null).then(
          (raw) => alive && setCfg(editableGroups(normalizeAdminMenuConfig(raw), ALL_ITEMS))
        );
      })
      .catch(() => {
        /* 院長だと分からなければ出さない */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!isAdmin || !cfg) return null;

  const update = (next: AdminMenuConfig) => {
    setCfg(next);
    setMsg("");
  };

  const save = async () => {
    setSaving(true);
    const ok = await savePortalObject(ADMIN_MENU_GROUPS_KEY, { groups: cfg.groups, updatedAt: new Date().toISOString() });
    setSaving(false);
    setMsg(ok ? "保存しました" : "保存に失敗しました");
    if (ok) window.dispatchEvent(new Event(ADMIN_MENU_UPDATED_EVENT));
  };

  const small = "h-8 px-2 text-xs";
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3" data-admin-menu-editor>
      <h2 className="text-sm font-bold text-slate-800">🗂 管理画面のメニュー</h2>
      {cfg.groups.map((g, gi) => (
        <section key={g.id} className="rounded-md border border-slate-200 p-2 space-y-1.5" data-admin-menu-edit-group={g.id}>
          <div className="flex flex-wrap items-center gap-1.5">
            {g.id === OTHER_GROUP_ID ? (
              <span className="text-sm font-semibold text-slate-700 px-1">{g.label}</span>
            ) : (
              <Input
                value={g.label}
                onChange={(e) => update(renameGroup(cfg, g.id, e.target.value))}
                className="h-8 max-w-[240px] text-sm"
                aria-label="グループの名前"
                data-admin-menu-group-name={g.id}
              />
            )}
            <Button variant="outline" size="sm" className={small} disabled={gi === 0} onClick={() => update(moveGroup(cfg, g.id, -1))}>
              ↑
            </Button>
            <Button variant="outline" size="sm" className={small} disabled={gi === cfg.groups.length - 1} onClick={() => update(moveGroup(cfg, g.id, 1))}>
              ↓
            </Button>
            {g.id !== OTHER_GROUP_ID && (
              <Button
                variant="outline"
                size="sm"
                className={`${small} text-red-700`}
                onClick={() => {
                  if (!confirm(`「${g.label}」を削除しますか？`)) return;
                  update(deleteGroup(cfg, g.id));
                }}
                data-admin-menu-group-delete={g.id}
              >
                削除
              </Button>
            )}
          </div>
          <ul className="space-y-1 pl-2">
            {g.items.map((k, ii) => (
              <li key={k} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700" data-admin-menu-edit-item={k}>
                <span className="min-w-[12rem]">{labelOf(k)}</span>
                <Button variant="outline" size="sm" className={small} disabled={ii === 0} onClick={() => update(moveItemWithin(cfg, g.id, k, -1))}>
                  ↑
                </Button>
                <Button variant="outline" size="sm" className={small} disabled={ii === g.items.length - 1} onClick={() => update(moveItemWithin(cfg, g.id, k, 1))}>
                  ↓
                </Button>
                <select
                  value={g.id}
                  onChange={(e) => update(moveItemToGroup(cfg, k, e.target.value))}
                  className="h-8 rounded-md border border-slate-200 bg-white px-1 text-xs"
                  aria-label="グループ"
                  data-admin-menu-item-group={k}
                >
                  {cfg.groups.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 max-w-[240px] text-sm" aria-label="グループの名前" data-admin-menu-new-name />
        <Button
          variant="outline"
          size="sm"
          disabled={!newName.trim()}
          onClick={() => {
            update(addGroup(cfg, newName));
            setNewName("");
          }}
          data-admin-menu-add
        >
          追加
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving} data-admin-menu-save>
          保存
        </Button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
