import type { MetadataRoute } from "next";

// 検索エンジンの収集を全面的に断る（指示書161 1-1）
// 院内専用アプリであり、公開URLで運用しているため、
// クロールされること自体を許さない。sitemap は置かない。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
