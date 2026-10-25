import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // 速度の指示書: 動的な画面（サーバーでログインを確かめて描く画面）も、戻ったときに30秒はブラウザの取り置きから出す。
  // 取り置きはタブのメモリだけ。ログイン・ログアウトの直後は画面ごと読み込み直す（lib/auth-navigation.ts）ので、前の人の画面は残らない。
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  output: "standalone",
  // 131-補: 認証付きPDF配信ルートに private/ のPDFをバンドルする（publicから退避済み）
  outputFileTracingIncludes: {
    "/api/corporate-book": ["./private/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.mkhifuka11.com",
      },
    ],
  },
};

export default nextConfig;
