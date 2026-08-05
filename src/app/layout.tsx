import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, BIZ_UDPGothic, M_PLUS_Rounded_1c } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import PageAccessGate from "@/components/PageAccessGate";
import "./globals.css";

// 139: おすすめフォント3種（切替は FontSwitcher・保存は localStorage "app_font"）。
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

// 保存済みフォントを最初の描画前に <html data-font> へ反映（FOUC防止）
const FONT_INIT_SCRIPT = `try{var f=localStorage.getItem("app_font");if(f==="biz"||f==="rounded"){document.documentElement.setAttribute("data-font",f)}}catch(e){}`;

export const metadata: Metadata = {
  title: "南草津皮フ科 スタッフ研修アプリ",
  description:
    "皮膚科専門医と共に安全な医療を提供するためのスタッフ研修アプリです。皮膚疾患・薬剤・美容施術・業務フローを網羅した学習ツールです。",
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
      lang="ja"
      className={`${notoSansJP.variable} ${bizUDPGothic.variable} ${mPlusRounded.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }} />
        <AuthProvider>
          {/* PageAccessGate: 既存ページの公開スイッチ（指示書124・OFF時のみ準備中） */}
          <AppShell>
            <PageAccessGate>{children}</PageAccessGate>
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
