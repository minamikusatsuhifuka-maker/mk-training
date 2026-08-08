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

export type MenuAccessEntry = {
  /** 指名されたアカウント。空＝管理者のみ */
  allowed_user_ids: string[];
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
    menus[key] = { allowed_user_ids: normalizeIds(entry.allowed_user_ids) };
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

export function withMenuAllowedUserIds(
  cfg: MenuAccessConfig,
  menuKey: string,
  userIds: string[]
): MenuAccessConfig {
  return {
    menus: {
      ...cfg.menus,
      [menuKey]: { allowed_user_ids: normalizeIds(userIds) },
    },
    updatedAt: new Date().toISOString(),
  };
}
