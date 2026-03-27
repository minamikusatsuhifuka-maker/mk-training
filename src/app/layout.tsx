import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "南草津皮フ科 スタッフ研修",
  description: "南草津皮フ科クリニック スタッフ研修アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 min-h-screen overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
