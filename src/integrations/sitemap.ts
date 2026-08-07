import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SITEMAP_FILENAME = "sitemap.xml";
const EXCLUDED_PAGE_PATHS = new Set(["/404", "/404/", "/404.html", "/500", "/500/", "/500.html"]);

export interface SitemapLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface GeneratedPage {
  pathname: string;
}

export interface ResolvedSitemapSite {
  url: URL;
  source: "astro" | "vercel" | "cloudflare-pages";
}

export interface ResolveSitemapSiteOptions {
  astroSite?: string | URL;
  env?: NodeJS.ProcessEnv;
}

export interface WriteSitemapOptions {
  dir: URL;
  pages: readonly GeneratedPage[];
  site: URL;
  logger: SitemapLogger;
}

export interface WriteSitemapResult {
  outputPath: string;
  pageCount: number;
}

function parseHttpUrl(value: string | undefined, addHttps = false): URL | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  let candidate = trimmed;
  if (addHttps && !/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return undefined;
  }
}

export function resolveSitemapSite({
  astroSite,
  env = process.env
}: ResolveSitemapSiteOptions = {}): ResolvedSitemapSite | undefined {
  if (astroSite) {
    const resolvedAstroSite = parseHttpUrl(
      typeof astroSite === "string" ? astroSite : astroSite.href
    );
    if (resolvedAstroSite) {
      return { url: resolvedAstroSite, source: "astro" };
    }
  }

  const vercelSite = parseHttpUrl(env.VERCEL_PROJECT_PRODUCTION_URL, true);
  if (vercelSite) {
    return { url: vercelSite, source: "vercel" };
  }

  const cloudflarePagesSite = parseHttpUrl(env.CF_PAGES_URL);
  if (cloudflarePagesSite) {
    return { url: cloudflarePagesSite, source: "cloudflare-pages" };
  }

  return undefined;
}

function normalizePagePath(pathname: string): string | undefined {
  const trimmed = pathname.trim();
  const withLeadingSlash = trimmed === "" ? "/" : (trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
  if (EXCLUDED_PAGE_PATHS.has(withLeadingSlash) || withLeadingSlash.endsWith(".md")) {
    return undefined;
  }

  return withLeadingSlash;
}

function pageUrl(site: URL, pathname: string): string {
  const root = new URL(site.origin);
  return new URL(pathname, root).href;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderSitemapXml(pages: readonly GeneratedPage[], site: URL): string {
  const urls = [...new Set(
    pages
      .map(({ pathname }) => normalizePagePath(pathname))
      .filter((pathname): pathname is string => pathname !== undefined)
      .map((pathname) => pageUrl(site, pathname))
  )].sort();

  const entries = urls.map((url) => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}${entries ? "\n" : ""}</urlset>\n`;
}

export async function writeSitemap({
  dir,
  pages,
  site,
  logger
}: WriteSitemapOptions): Promise<WriteSitemapResult> {
  const sitemapPages = pages.filter(({ pathname }) => normalizePagePath(pathname) !== undefined);
  const uniquePageCount = new Set(sitemapPages.map(({ pathname }) => normalizePagePath(pathname))).size;
  const outputPath = fileURLToPath(new URL(SITEMAP_FILENAME, dir));

  await writeFile(outputPath, renderSitemapXml(pages, site), "utf8");
  logger.info(`[zuedocs] Wrote sitemap for ${uniquePageCount} page${uniquePageCount === 1 ? "" : "s"} to ${outputPath}`);

  return { outputPath, pageCount: uniquePageCount };
}

export function warnMissingSitemapSite(logger: SitemapLogger): void {
  logger.warn(
    "[zuedocs] Sitemap skipped because no deployed site URL was available. " +
    "Production Vercel and Cloudflare Pages builds are detected automatically; " +
    "other deployments can set Astro's site option."
  );
}
