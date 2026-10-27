import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, BIZ_UDPGothic, M_PLUS_Rounded_1c } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import PageAccessGate from "@/components/PageAccessGate";
import { TerminalIdleLogout } from "@/components/TerminalIdleLogout";
import { FetchCacheInstaller } from "@/components/FetchCacheInstaller";
import { fontInitScript } from "@/lib/font-pref";
import "./globals.css";

// 139: おすすめフォント3種（切替は FontSwitcher）。271: 文字の大きさ・院長の既定・アカウントに残す（lib/font-pref.ts）。
// next/font はセルフホスト＋font-display:swap＝読み込み失敗時はシステムフォントへ自動フォールバック。
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const bizUDPGothic = BIZ_UDPGothic({
  variable: "--font-biz-udp",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const mPlusRounded = M_PLUS_Rounded_1c({
  variable: "--font-mplus-rounded",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// その人に使うフォントと文字の大きさを最初の描画前に <html data-font data-text-size> へ反映（FOUC防止）。
// 271: proxy.ts が入れる Cookie（アカウントの選択 → 院長の既定）を先に読む。
// html の属性は描画前にこのスクリプトが入れるので、サーバーの html と違っても警告を出さない（suppressHydrationWarning）
const FONT_INIT_SCRIPT = fontInitScript();

export const metadata: Metadata = {
  title: "南草津皮フ科 スタッフ研修アプリ",
  description:
    "皮膚科専門医と共に安全な医療を提供するためのスタッフ研修アプリです。皮膚疾患・薬剤・美容施術・業務フローを網羅した学習ツールです。",
  // 161: 院内専用。検索エンジンに載せない（robots.ts と両方で断る）。
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1D9E75",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="ja"
      className={`${notoSansJP.variable} ${bizUDPGothic.variable} ${mPlusRounded.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }} />
        <AuthProvider>
          {/* 192 D: 院内端末（鍵あり・スイッチON）だけ、無操作で自動ログアウト。それ以外は何もしない */}
          <FetchCacheInstaller />
          <TerminalIdleLogout />
          {/* PageAccessGate: 既存ページの公開スイッチ（指示書124・OFF時のみ準備中） */}
          <AppShell>
            <PageAccessGate>{children}</PageAccessGate>
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
