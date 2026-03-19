import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://rohlaxwellness.com";

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/#services`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/#story`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/#events`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/#providers`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/#contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
