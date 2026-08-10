// APIルートの認証漏れ検査（指示書161 §9 再発防止）
//
// 161の教訓: 「対策を決めたら、適用漏れがないことを機械的に確認できる形にする」。
// 145で決めた「サーバー側で権限を強制する」が、実際には58本中18本に入っていなかった。
// 目視では漏れる。よってビルドのたびに全ルートを機械的に数える。
//
// 判定:
//   1. src/app/api 配下の route.ts を全部見つける
//   2. 認証・認可のいずれかを呼んでいるか（下の GUARDS のどれか）
//   3. 呼んでいないものは PUBLIC_ROUTES に**明示的に**書かれていなければ失敗
//   4. PUBLIC_ROUTES に書いてあるのに実際は守られている／消えた場合も知らせる
//
// 実行: node scripts/check-api-auth.mjs（npm run build の前に走る）

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_DIR = new URL("../src/app/api", import.meta.url).pathname;

/** ルート内でこれらのいずれかを呼んでいれば「自前で守っている」とみなす */
const GUARDS = [
  "requireLogin", // 161: ログイン必須（汎用）
  "requireAdmin", // 39: 管理者必須
  "getSessionUser", // セッションを自分で見て判定している
  "authorizeDocTasks", // 154: 書類進捗ボード（指名制・非許可は404）
  "authorizeMemberNotes", // 149: メンバーノート（指名制・非許可は404）
  "authorizeEvents", // 128: イベント（閲覧=ログイン済み・投稿=編集者）
  "CRON_SECRET", // 155: Vercel Cron 用の共有鍵
  "HR_CHAT_KNOWLEDGE_TOKEN", // ai-incho からのサーバー間呼び出し
];

/**
 * 認証を通さずに到達してよいルート。**増やすときは理由を必ず書くこと。**
 * ここに書いたものは proxy.ts の PUBLIC_API_PATHS とも一致していなければならない。
 */
const PUBLIC_ROUTES = new Map([
  ["join", "招待コードでの登録。ログイン前にしか呼べない。コード一致＋IPレート制限で守る。"],
]);

function findRoutes(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findRoutes(p));
    else if (name === "route.ts" || name === "route.js") out.push(p);
  }
  return out;
}

const files = findRoutes(API_DIR).sort();
const unguarded = [];
const guarded = [];

for (const f of files) {
  const name = relative(API_DIR, f).split(sep).slice(0, -1).join("/");
  const src = readFileSync(f, "utf8");
  if (GUARDS.some((g) => src.includes(g))) guarded.push(name);
  else unguarded.push(name);
}

const errors = [];

for (const name of unguarded) {
  if (!PUBLIC_ROUTES.has(name)) {
    errors.push(
      `認証されていないAPIルートです: /api/${name}\n` +
        `  → src/lib/require-login.ts の requireLogin() を先頭に入れてください。\n` +
        `  → 未認証で到達させるなら、理由を添えて scripts/check-api-auth.mjs の\n` +
        `     PUBLIC_ROUTES と src/proxy.ts の PUBLIC_API_PATHS の両方に追加してください。`
    );
  }
}

for (const name of PUBLIC_ROUTES.keys()) {
  if (!unguarded.includes(name)) {
    errors.push(
      `PUBLIC_ROUTES に /api/${name} がありますが、実際には認証されている（または消えた）ようです。\n` +
        `  → 一覧が実態とずれています。scripts/check-api-auth.mjs を直してください。`
    );
  }
}

console.log(
  `[check-api-auth] APIルート ${files.length} 本 / 認証あり ${guarded.length} 本 / ` +
    `未認証（明示的に許可）${unguarded.length} 本`
);

if (errors.length > 0) {
  console.error("\n[check-api-auth] 失敗\n");
  for (const e of errors) console.error(`- ${e}\n`);
  process.exit(1);
}
