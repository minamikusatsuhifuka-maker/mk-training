// 外部アプリへのリンク（指示書69）
// URLはここ1か所に集約する。設置箇所（サイドバー nav.ts・ホームのクイックリンク page.tsx）は
// この定数を参照すること。直書きすると差し替え漏れが起きる。
//
// 必ず「本番エイリアス（<プロジェクト名>.vercel.app）」を使う。
// git-main のプレビューURL（〜-git-main-〜.vercel.app）は使わないこと:
//   - ブランチ運用の変更でURLが変わる（ブックマーク切れ）
//   - Vercelのデプロイ保護によりスタッフに vercel.com のログイン画面が出る

// AI院長（Vercelプロジェクト名: ai-incho）
export const AI_INCHO_URL = "https://ai-incho.vercel.app/";
