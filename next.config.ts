import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
