import type { MetadataRoute } from "next";
import { OCCASIONS } from "@/lib/gift-options";
import { occasionToSlug } from "@/lib/occasion-slugs";

const SITE = "https://thegiftfinder.net";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...OCCASIONS.map((occasion) => ({
      url: `${SITE}/gifts/${occasionToSlug(occasion)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: `${SITE}/disclosure`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 },
  ];
}
