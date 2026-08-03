"use client";

// 📕 コーポレートブック閲覧（指示書131・公開スイッチ page_corporate_book=公開型・既定ON）
// - 実体はリポジトリ内の public/corporate-design-book.pdf の1ファイルのみ。
//   資料庫側はリンク型カード（本ページへのリンク）＝二重アップロードなし。
//   改訂時はこのPDFファイルを差し替える1コミットで両導線が更新される（版管理・指示書131）。
// - 表示方式（STEP0承認・c案）: iOS SafariのPDFインライン表示制約（iframeは1ページ目のみ）を
//   回避するため、md以上=iframe埋め込みプレビュー／モバイル=新タブで開く大ボタンに出し分け。
// - 直URLガードは PageAccessGate（124基盤・page系フラグ）が担当。
// - 131-補: PDF実体は認証付きAPI（/api/corporate-book・ログイン必須）経由でのみ配信。

import NavPageHeader from "@/components/NavPageHeader";

const PDF_PATH = "/api/corporate-book";
const PDF_VERSION = "2026年7月版";

export default function CorporateBookPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <NavPageHeader
        navKey="/corporate-book"
        title="📕 コーポレートブック"
        description={`Corporate Design Book（${PDF_VERSION}）`}
      />

      {/* 紹介文（STEP0提案のまま）＋版表記 */}
      <div className="space-y-2">
        <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
          当院の理念・ビジョン・人事制度のすべてがまとまった一冊です。困ったとき・迷ったときは、いつでもここに戻ってきてください。
        </p>
        <p className="text-xs text-gray-500 px-1">
          {PDF_VERSION}（全53ページ）。内容は毎年ブラッシュアップされます。
        </p>
      </div>

      {/* 操作ボタン（全幅共通）。ダウンロードは同一オリジンのため download 属性が有効 */}
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={PDF_PATH}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium px-5 py-3 rounded-full bg-teal-700 text-white shadow-md hover:bg-teal-800 hover:shadow-lg transition-colors"
        >
          📖 ブックを開く（新しいタブ）
        </a>
        <a
          href={`${PDF_PATH}?download=1`}
          className="text-sm px-4 py-3 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          ⬇️ ダウンロード
        </a>
      </div>

      {/* モバイル向けの案内（埋め込みはmd以上のみ） */}
      <p className="md:hidden text-xs text-gray-500 leading-relaxed">
        スマートフォンでは「📖 ブックを開く」から全ページをご覧いただけます（ピンチで拡大できます）。
      </p>

      {/* 埋め込みプレビュー（md以上のみ・iOS Safariのiframe制約回避のためモバイルでは出さない） */}
      <iframe
        src={PDF_PATH}
        title={`Corporate Design Book ${PDF_VERSION}`}
        className="hidden md:block w-full rounded-xl border border-gray-200 bg-white"
        style={{ height: "75vh" }}
      />
    </div>
  );
}
