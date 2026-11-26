import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type LinkCheckMode = "error" | "warn" | "off";

export interface LinkCheckLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface BrokenLink {
  page: string;
  href: string;
  reason: "missing-page" | "missing-anchor";
}

const ANCHOR_HREF = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const ID_ATTRIBUTE = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const NON_CONTENT = /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const SKIPPED_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

async function listHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function pageUrlForFile(distDir: string, file: string): string {
  const path = "/" + relative(distDir, file).split(sep).join("/");
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length);
  return path.endsWith(".html") ? path.slice(0, -".html".length) : path;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Script templates and comments can hold href-like text that is not a link.
export function stripNonContent(html: string): string {
  return html.replace(NON_CONTENT, "");
}

export function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const match of stripNonContent(html).matchAll(ANCHOR_HREF)) {
    hrefs.push(decodeHtmlAttribute(match[1] ?? match[2] ?? ""));
  }
  return hrefs;
}

export function extractIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of stripNonContent(html).matchAll(ID_ATTRIBUTE)) {
    ids.add(decodeHtmlAttribute(match[1] ?? match[2] ?? ""));
  }
  return ids;
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export interface CheckLinksOptions {
  dir: URL;
  base?: string;
}

export async function findBrokenLinks({ dir, base = "/" }: CheckLinksOptions): Promise<BrokenLink[]> {
  const distDir = fileURLToPath(dir);
  const basePath = base.endsWith("/") ? base : `${base}/`;
  const htmlFiles = await listHtmlFiles(distDir);
  const idsByFile = new Map<string, Set<string>>();
  const htmlByFile = new Map<string, string>();

  await Promise.all(htmlFiles.map(async (file) => {
    const html = await readFile(file, "utf8");
    htmlByFile.set(file, html);
    idsByFile.set(file, extractIds(html));
  }));

  const resolvedTargets = new Map<string, string | null>();
  const resolveTarget = async (pathname: string): Promise<string | null> => {
    if (resolvedTargets.has(pathname)) return resolvedTargets.get(pathname) ?? null;

    let target: string | null = null;
    if (pathname.startsWith(basePath) || `${pathname}/` === basePath) {
      const local = safeDecode(pathname.slice(basePath.length)).replace(/\/+$/, "");
      const candidates = local === ""
        ? [join(distDir, "index.html")]
        : [join(distDir, local), join(distDir, local, "index.html"), join(distDir, `${local}.html`)];
      for (const candidate of candidates) {
        if (await isFile(candidate)) {
          target = candidate;
          break;
        }
      }
    }
    resolvedTargets.set(pathname, target);
    return target;
  };

  const broken: BrokenLink[] = [];
  const origin = "https://zuedocs.invalid";

  for (const file of htmlFiles) {
    const pageUrl = pageUrlForFile(distDir, file);
    const html = htmlByFile.get(file) ?? "";
    const seen = new Set<string>();

    for (const href of extractHrefs(html)) {
      const trimmed = href.trim();
      if (!trimmed || trimmed === "#" || SKIPPED_SCHEME.test(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);

      const url = new URL(trimmed, `${origin}${pageUrl}`);
      if (url.origin !== origin) continue;

      const target = await resolveTarget(url.pathname);
      if (!target) {
        broken.push({ page: pageUrl, href: trimmed, reason: "missing-page" });
        continue;
      }

      const fragment = safeDecode(url.hash.slice(1));
      if (!fragment || !target.endsWith(".html")) continue;
      if (!idsByFile.get(target)?.has(fragment)) {
        broken.push({ page: pageUrl, href: trimmed, reason: "missing-anchor" });
      }
    }
  }

  return broken.sort((a, b) => a.page.localeCompare(b.page) || a.href.localeCompare(b.href));
}

export function formatBrokenLinks(broken: BrokenLink[]): string {
  const lines = broken.map((link) => {
    const reason = link.reason === "missing-anchor" ? "no matching heading or id" : "page not found";
    return `  ${link.page} -> ${link.href} (${reason})`;
  });
  const noun = broken.length === 1 ? "broken internal link" : "broken internal links";
  return `[zuedocs] Found ${broken.length} ${noun}:\n${lines.join("\n")}`;
}

export async function checkLinks({
  dir,
  base,
  mode,
  logger
}: CheckLinksOptions & { mode: LinkCheckMode; logger: LinkCheckLogger }) {
  if (mode === "off") return;

  const broken = await findBrokenLinks({ dir, base });
  if (broken.length === 0) {
    logger.info("[zuedocs] Link check passed");
    return;
  }

  const report = formatBrokenLinks(broken);
  if (mode === "warn") {
    logger.warn(report);
    return;
  }

  throw new Error(
    `${report}\nFix the links, or set zuedocs({ linkCheck: "warn" }) in astro.config to report without failing the build.`
  );
}
