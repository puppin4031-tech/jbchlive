// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://jbchlive.lovable.app";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface SitemapEntry {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/live", changefreq: "hourly", priority: "0.9" },
  { path: "/community", changefreq: "daily", priority: "0.8" },
  { path: "/pricing", changefreq: "monthly", priority: "0.6" },
  { path: "/search", changefreq: "weekly", priority: "0.4" },
];

async function fetchRows(
  table: string,
  query: string,
): Promise<Array<Record<string, string>>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return (await res.json()) as Array<Record<string, string>>;
  } catch {
    return [];
  }
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const channels = await fetchRows(
    "channels",
    "select=id&status=eq.approved&limit=1000",
  );
  const sermons = await fetchRows(
    "sermons",
    "select=id&is_live=eq.false&limit=2000",
  );

  const entries: SitemapEntry[] = [
    ...staticEntries,
    ...channels.map((c) => ({
      path: `/channel/${c.id}`,
      changefreq: "weekly" as const,
      priority: "0.7",
    })),
    ...sermons.map((s) => ({
      path: `/vod/${s.id}`,
      changefreq: "monthly" as const,
      priority: "0.6",
    })),
  ];

  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
  console.log(`sitemap.xml written (${entries.length} entries)`);
}

main();
