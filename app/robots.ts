import type { MetadataRoute } from "next";

const SITE = "https://thegiftfinder.net";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing useful to crawl here, and it's a POST endpoint anyway.
      disallow: "/api/",
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
