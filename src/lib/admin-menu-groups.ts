// 管理画面の左のメニューのグループ（指示書241）— 純関数・依存なし
//
// 【決まり】
//   ・「📊 ダッシュボード」はグループに入れず、いちばん上に置く
//   ・院長がグループを作る・名前を変える・消す・順番を変える・メニューを別のグループへ移す・グループの中の順番を変える
//   ・メニューが消えないように：グループを消したら中のメニューは「その他」へ。どのグループにも入っていないメニュー（今後増えた物も）は「その他」へ自動で入る。
//     「その他」は消せない。中身が無いときは左のメニューに出さない（ほかのグループも、中身が無ければ出さない）
//   ・メニューの名前・行き先・見られる人は変えない（並べ方と見せ方だけ）。見られる項目の判定は今までどおり AdminShell 側
// 保存は content_store の ADMIN_MENU_GROUPS_KEY（読むのはログイン済み・書くのは院長だけ）。
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。

export const ADMIN_MENU_GROUPS_KEY = "admin_menu_groups";
/** 「🧭 サイドバー構成」で保存したら、すぐ左のメニューに反映するための合図（window のイベント名） */
export const ADMIN_MENU_UPDATED_EVENT = "mk-admin-menu-updated";
export const OTHER_GROUP_ID = "other";
export const OTHER_GROUP_LABEL = "その他";
/** グループに入れず、いちばん上に置く項目 */
export const TOP_MENU_KEY = "dashboard";

/**
 * ADMIN_ITEMS 以外に、左のメニューに出る項目（権限を確かめてから出すもの）。key は振り分けの保存に使う目印。
 * 名前と行き先は AdminShell と同じ（変えない）。
 */
export const EXTRA_MENU_ITEMS: readonly { key: string; label: string; href: string }[] = [
  { key: "x:member-notes", label: "📔 メンバーノート", href: "/member-notes" },
  { key: "x:doc-tasks", label: "📋 書類進捗ボード", href: "/doc-tasks" },
  { key: "x:doc-tasks-settings", label: "⚙️ 書類進捗ボードの設定", href: "/doc-tasks/settings" },
  { key: "x:staff-contacts", label: "📇 スタッフ連絡先", href: "/staff-contacts" },
  { key: "x:staff-contacts-settings", label: "⚙️ スタッフ連絡先の設定", href: "/staff-contacts/settings" },
  { key: "x:retro", label: "🧭 院長の振り返り記録", href: "/director-retrospective" },
  { key: "x:staff-growth", label: "🌱 可能性ノート", href: "/staff-growth" },
  { key: "x:courses", label: "🗂 講座マスタ・AI下書き設定", href: "/staff-growth/courses" },
];

export type AdminMenuGroup = { id: string; label: string; items: string[] };
export type AdminMenuConfig = { groups: AdminMenuGroup[]; updatedAt?: string };

/** はじめの振り分け（241 §1・グループの名前は仮。院長が画面で変えられる） */
export const DEFAULT_ADMIN_MENU_GROUPS: readonly AdminMenuGroup[] = [
  {
    id: "g-ops",
    label: "🏠 運営・ポータル",
    items: [
      "portal",
      "nav",
      "staff-members",
      "task-categories",
      "operations",
      "profile-fields",
      "staff-accounts",
      "x:doc-tasks",
      "x:doc-tasks-settings",
      "x:staff-contacts",
      "x:staff-contacts-settings",
    ],
  },
  {
    id: "g-growth",
    label: "🌱 人材育成・1on1",
    items: [
      "presurvey",
      "presurvey-answers",
      "one-on-one-slots",
      "x:staff-growth",
      "x:courses",
      "x:member-notes",
      "expert",
      "deep-research",
      "notice-attendance",
    ],
  },
  { id: "g-org", label: "🏛 組織・理念", items: ["knowledge-system", "ai-background", "x:retro", "priority-matrix"] },
  {
    id: "g-medical",
    label: "📚 医療の知識",
    items: ["knowledge", "diseases", "drugs", "contraindications", "interactions", "pregnancy", "biologics", "medical-fees", "quiz"],
  },
  { id: "g-beauty", label: "✨ 美容・カウンセリング", items: ["counseling", "cosmetic", "skincare"] },
  { id: "g-settings", label: "⚙ 設定・検証", items: ["delegation", "settings", "test-seed", "delete-password", "terminals", "changelog"] },
  { id: OTHER_GROUP_ID, label: OTHER_GROUP_LABEL, items: [] },
];

const GROUP_ID_RE = /^[a-z0-9-]{1,40}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 保存値を整える（壊れていたら、はじめの振り分け）。「その他」は必ず1つあり、同じ項目は1か所にだけ入る */
export function normalizeAdminMenuConfig(raw: unknown): AdminMenuConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>).groups : null;
  if (!Array.isArray(src) || src.length === 0) {
    return { groups: DEFAULT_ADMIN_MENU_GROUPS.map((g) => ({ ...g, items: [...g.items] })) };
  }
  const seenItems = new Set<string>();
  const seenIds = new Set<string>();
  const groups: AdminMenuGroup[] = [];
  for (const g of src) {
    if (!g || typeof g !== "object") continue;
    const o = g as Record<string, unknown>;
    const id = str(o.id, 40);
    if (!GROUP_ID_RE.test(id) || seenIds.has(id)) continue;
    seenIds.add(id);
    const items: string[] = [];
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const k = str(it, 80);
      if (!k || k === TOP_MENU_KEY || seenItems.has(k)) continue;
      seenItems.add(k);
      items.push(k);
    }
    const label = id === OTHER_GROUP_ID ? OTHER_GROUP_LABEL : str(o.label, 40) || "（名前なし）";
    groups.push({ id, label, items });
  }
  if (!groups.some((g) => g.id === OTHER_GROUP_ID)) groups.push({ id: OTHER_GROUP_ID, label: OTHER_GROUP_LABEL, items: [] });
  return { groups };
}

export type MenuItemLike = { key: string; label: string; href: string };
export type ResolvedAdminMenu = {
  top: MenuItemLike | null;
  groups: { id: string; label: string; items: MenuItemLike[] }[];
};

/**
 * 見られる項目（available・順不同）を、グループに並べる。
 *   ・どのグループにも入っていない項目は「その他」の末尾へ（今後増えた項目も消えない）
 *   ・中身が無いグループは出さない（委任された幹部に、開けない項目しか無いグループは出ない）
 */
export function resolveAdminMenu(cfg: AdminMenuConfig, available: readonly MenuItemLike[]): ResolvedAdminMenu {
  const byKey = new Map(available.map((i) => [i.key, i]));
  const top = byKey.get(TOP_MENU_KEY) ?? null;
  const placed = new Set<string>([TOP_MENU_KEY]);
  const groups = cfg.groups.map((g) => {
    const items: MenuItemLike[] = [];
    for (const k of g.items) {
      const it = byKey.get(k);
      if (it && !placed.has(k)) {
        items.push(it);
        placed.add(k);
      }
    }
    return { id: g.id, label: g.label, items };
  });
  const other = groups.find((g) => g.id === OTHER_GROUP_ID);
  for (const it of available) {
    if (placed.has(it.key)) continue;
    if (other) other.items.push(it);
    placed.add(it.key);
  }
  return { top, groups: groups.filter((g) => g.items.length > 0) };
}

/** その href を含むグループ（今のページのグループを開いておくため） */
export function groupOfHref(menu: ResolvedAdminMenu, href: string): string | null {
  for (const g of menu.groups) if (g.items.some((i) => i.href === href)) return g.id;
  return null;
}

// ─── 院長の操作（どれも新しい設定を返す・元は変えない） ───

const clone = (cfg: AdminMenuConfig): AdminMenuConfig => ({ groups: cfg.groups.map((g) => ({ ...g, items: [...g.items] })) });

export function newGroupId(now = Date.now(), rand = Math.random()): string {
  return `g-${now.toString(36)}${rand.toString(36).slice(2, 6)}`;
}

/** グループを作る（「その他」の手前に足す） */
export function addGroup(cfg: AdminMenuConfig, label: string, id = newGroupId()): AdminMenuConfig {
  const next = clone(cfg);
  const at = next.groups.findIndex((g) => g.id === OTHER_GROUP_ID);
  const g = { id, label: str(label, 40) || "（名前なし）", items: [] };
  if (at >= 0) next.groups.splice(at, 0, g);
  else next.groups.push(g);
  return next;
}

export function renameGroup(cfg: AdminMenuConfig, id: string, label: string): AdminMenuConfig {
  if (id === OTHER_GROUP_ID) return cfg;
  const next = clone(cfg);
  const g = next.groups.find((x) => x.id === id);
  if (g) g.label = str(label, 40) || g.label;
  return next;
}

/** グループを消す。中のメニューは「その他」へ移す（メニューは消えない）。「その他」は消せない */
export function deleteGroup(cfg: AdminMenuConfig, id: string): AdminMenuConfig {
  if (id === OTHER_GROUP_ID) return cfg;
  const next = clone(cfg);
  const g = next.groups.find((x) => x.id === id);
  if (!g) return cfg;
  next.groups = next.groups.filter((x) => x.id !== id);
  let other = next.groups.find((x) => x.id === OTHER_GROUP_ID);
  if (!other) {
    other = { id: OTHER_GROUP_ID, label: OTHER_GROUP_LABEL, items: [] };
    next.groups.push(other);
  }
  other.items.push(...g.items);
  return next;
}

/** グループの順番を変える（dir: -1=↑ / 1=↓） */
export function moveGroup(cfg: AdminMenuConfig, id: string, dir: -1 | 1): AdminMenuConfig {
  const next = clone(cfg);
  const i = next.groups.findIndex((g) => g.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.groups.length) return cfg;
  [next.groups[i], next.groups[j]] = [next.groups[j], next.groups[i]];
  return next;
}

/** メニューを別のグループへ移す（移した先の末尾へ） */
export function moveItemToGroup(cfg: AdminMenuConfig, key: string, toGroupId: string): AdminMenuConfig {
  const next = clone(cfg);
  const to = next.groups.find((g) => g.id === toGroupId);
  if (!to) return cfg;
  for (const g of next.groups) g.items = g.items.filter((k) => k !== key);
  to.items.push(key);
  return next;
}

/** グループの中でメニューの順番を変える（dir: -1=↑ / 1=↓） */
export function moveItemWithin(cfg: AdminMenuConfig, groupId: string, key: string, dir: -1 | 1): AdminMenuConfig {
  const next = clone(cfg);
  const g = next.groups.find((x) => x.id === groupId);
  if (!g) return cfg;
  const i = g.items.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= g.items.length) return cfg;
  [g.items[i], g.items[j]] = [g.items[j], g.items[i]];
  return next;
}

/**
 * 院長の画面で扱う形：すべての項目（allItems）を、今の設定のグループに並べる（どこにも無い項目は「その他」）。
 * 院長には全部見えるので、空のグループも出す（左のメニューと違い、空でも編集できるように）。
 */
export function editableGroups(cfg: AdminMenuConfig, allItems: readonly MenuItemLike[]): AdminMenuConfig {
  const known = new Set(allItems.map((i) => i.key));
  const next = clone(cfg);
  const placed = new Set<string>();
  for (const g of next.groups) {
    g.items = g.items.filter((k) => known.has(k) && !placed.has(k) && k !== TOP_MENU_KEY);
    g.items.forEach((k) => placed.add(k));
  }
  const other = next.groups.find((g) => g.id === OTHER_GROUP_ID)!;
  for (const it of allItems) if (it.key !== TOP_MENU_KEY && !placed.has(it.key)) other.items.push(it.key);
  return next;
}
