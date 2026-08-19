// メニューごとの閲覧許可（指示書157-B）— 型と正規化の純関数
//
// 【なぜメニューキー付きなのか】
// 今回設定するのは書類進捗ボードの1項目だけだが、将来「管理画面の各項目ごと」
// 「サイドメニュー全機能ごと」に広げる方針が決まっている。そのときにデータ移行が
// 起きないよう、**最初からメニューキーで引く形**にしておく。
//   画面は今回 doc-tasks の1行だけ描画し、増えるときは行を足すだけ。
//
// 【保存先】content_store の単一キー `menu_access`（新規テーブルを作らない方針）。
//   content_store は RLS 有効・ポリシー無し＝直接アクセス全拒否で、読み書きは
//   サーバー（service-role）経由のみ。さらに **このキーはクライアントAPIからは読めない**
//   （content-store-policy の server-only キー）。誰が何を開けるかは機能の存在に直結するため。
//
// 【判定の原則】未設定→管理者のみ／失敗・例外→開けない方向（fail-close）。

export const MENU_ACCESS_KEY = "menu_access";

/** メニューキー（＝将来ここに行が増える） */
export const MENU_DOC_TASKS = "doc-tasks";
/**
 * スタッフ連絡先（指示書169）。
 * **scope（159-A の「全員」モード）は使わない。**
 * 住所・電話番号と、本人以外（家族・保証人）の個人情報を含むため、
 * 「全員が開ける」状態を作れる口そのものを持たせない
 *（判定側の authorizeStaffContacts が scope を読まないので、
 *   仮に値が書き込まれても指名制のまま動く）。
 */
export const MENU_STAFF_CONTACTS = "staff-contacts";

/**
 * 公開範囲（指示書159-A）。
 * - listed   … 指名した人だけ（＝157/158からの現行動作）。**既定**
 * - everyone … ログイン済み・有効なアカウント全員
 *
 * 未設定・不明な値は必ず listed に倒す（開ける方向に倒さない）。
 */
export type MenuScope = "listed" | "everyone";

export const MENU_SCOPE_LISTED: MenuScope = "listed";
export const MENU_SCOPE_EVERYONE: MenuScope = "everyone";

/** 画面と操作ログで使う表示名（表記を1か所に揃える） */
export function scopeLabel(scope: MenuScope): string {
  return scope === MENU_SCOPE_EVERYONE ? "全員" : "指名した人だけ";
}

export type MenuAccessEntry = {
  /** 指名されたアカウント。空＝管理者のみ */
  allowed_user_ids: string[];
  /**
   * 159-A: 公開範囲。**保存済みデータには無いので、無ければ listed とみなす**
   * （既存環境が勝手に「全員」へ広がらないようにするため）。
   */
  scope: MenuScope;
};

export type MenuAccessConfig = {
  /** メニューキー → 許可設定。キーが無いメニューは「未設定」 */
  menus: Record<string, MenuAccessEntry>;
  updatedAt: string;
};

export function emptyMenuAccess(): MenuAccessConfig {
  return { menus: {}, updatedAt: "" };
}

const MAX_IDS = 200;
const MAX_MENUS = 100;

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    )
  ).slice(0, MAX_IDS);
}

export function normalizeMenuAccess(raw: unknown): MenuAccessConfig {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const src = (g.menus && typeof g.menus === "object" ? g.menus : {}) as Record<
    string,
    unknown
  >;
  const menus: Record<string, MenuAccessEntry> = {};
  for (const [key, value] of Object.entries(src).slice(0, MAX_MENUS)) {
    if (!key) continue;
    const entry = (value && typeof value === "object" ? value : {}) as Record<
      string,
      unknown
    >;
    menus[key] = {
      allowed_user_ids: normalizeIds(entry.allowed_user_ids),
      // 159-A: "everyone" と**明示的に**書かれているときだけ全員。
      // 未設定・想定外の値・壊れた値はすべて listed（＝指名した人だけ）に倒す。
      scope: entry.scope === MENU_SCOPE_EVERYONE ? MENU_SCOPE_EVERYONE : MENU_SCOPE_LISTED,
    };
  }
  return {
    menus,
    updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : "",
  };
}

/**
 * そのメニューの指名リスト。**キー自体が無ければ null**（＝未設定）を返す。
 * 「未設定」と「空リストを保存した」を区別できるようにしておく
 * （移設時に旧設定へフォールバックするかどうかの判断に使う）。
 */
export function menuAllowedUserIds(
  cfg: MenuAccessConfig,
  menuKey: string
): string[] | null {
  const entry = cfg.menus[menuKey];
  return entry ? entry.allowed_user_ids : null;
}

/**
 * そのメニューの公開範囲（159-A）。**キーが無ければ listed**。
 * 「未設定なら全員」には絶対にしない。
 */
export function menuScope(cfg: MenuAccessConfig, menuKey: string): MenuScope {
  return cfg.menus[menuKey]?.scope === MENU_SCOPE_EVERYONE
    ? MENU_SCOPE_EVERYONE
    : MENU_SCOPE_LISTED;
}

export function withMenuAllowedUserIds(
  cfg: MenuAccessConfig,
  menuKey: string,
  userIds: string[]
): MenuAccessConfig {
  return {
    menus: {
      ...cfg.menus,
      [menuKey]: {
        allowed_user_ids: normalizeIds(userIds),
        // 指名リストだけを変えるときは、公開範囲は今の値を保つ
        scope: menuScope(cfg, menuKey),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

/** 公開範囲だけを変える（指名リストは保つ）。159-A */
export function withMenuScope(
  cfg: MenuAccessConfig,
  menuKey: string,
  scope: MenuScope
): MenuAccessConfig {
  return {
    menus: {
      ...cfg.menus,
      [menuKey]: {
        allowed_user_ids: cfg.menus[menuKey]?.allowed_user_ids ?? [],
        scope: scope === MENU_SCOPE_EVERYONE ? MENU_SCOPE_EVERYONE : MENU_SCOPE_LISTED,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}
