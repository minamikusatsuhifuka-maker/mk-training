import type { Metadata, Viewport } from "next";
import {
  Noto_Sans_JP,
  BIZ_UDPGothic,
  M_PLUS_Rounded_1c,
  Zen_Kaku_Gothic_New,
  IBM_Plex_Sans_JP,
  M_PLUS_1p,
} from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import PageAccessGate from "@/components/PageAccessGate";
import { TerminalIdleLogout } from "@/components/TerminalIdleLogout";
import { FetchCacheInstaller } from "@/components/FetchCacheInstaller";
import { FontRestore } from "@/components/FontRestore";
import { fontInitScript } from "@/lib/font-pref";
import "./globals.css";

// 139: おすすめフォント3種（切替は FontSwitcher）。271: 文字の大きさ・院長の既定・アカウントに残す（lib/font-pref.ts）。
// 272: くっきり見やすい3つを足して6つ。足すものは、ふだんの文字と太字（400・700）＝太字が機械的に太らされない。
// next/font はセルフホスト＋font-display:swap。日本語のフォントは文字の範囲ごとの小さなファイルに分かれていて、
// ブラウザは画面に使われている書体の、使われている文字のファイルだけを取りに行く。
// preload: false ＝ 前もって全部を読み込まない（272 前は3書体ぶん約360ファイルを毎回先読みしていた）。
// 読み込みに失敗したら FontRestore が あ標準 に戻す（どの書体かは FONT_FAMILIES で見分ける）。
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const bizUDPGothic = BIZ_UDPGothic({
  variable: "--font-biz-udp",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

const mPlusRounded = M_PLUS_Rounded_1c({
  variable: "--font-mplus-rounded",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const zenKakuGothic = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

const ibmPlexSansJP = IBM_Plex_Sans_JP({
  variable: "--font-ibm-plex-jp",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

const mPlus1p = M_PLUS_1p({
  variable: "--font-mplus-1p",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

const FONTS = { noto: notoSansJP, biz: bizUDPGothic, rounded: mPlusRounded, zen: zenKakuGothic, plex: ibmPlexSansJP, mplus: mPlus1p };
// 書体の名前（"'Zen Kaku Gothic New', 'Zen Kaku Gothic New Fallback'" の最初の名前）
const FONT_FAMILIES = Object.fromEntries(
  Object.entries(FONTS).map(([id, f]) => [id, f.style.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "")]),
);

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
      className={`${Object.values(FONTS).map((f) => f.variable).join(" ")} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }} />
        <FontRestore families={FONT_FAMILIES} />
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
