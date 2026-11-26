import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderAsync, type ResvgRenderOptions } from "@resvg/resvg-js";

import { OG_IMAGE_PREFIX } from "../seo.ts";

export interface OgImageLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface OgCard {
  siteName: string;
  title: string;
  description?: string;
  eyebrow?: string;
  host?: string;
  accent: string;
  logoDataUri?: string;
}

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 80;
const TEXT_WIDTH = WIDTH - PAD * 2;
const DEFAULT_ACCENT = "#ff6a2a";
const FONT_DIR = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
const FONT_FILES = ["SpaceGrotesk-Regular.ttf", "SpaceGrotesk-Medium.ttf"].map((name) => join(FONT_DIR, name));

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Approximate Space Grotesk advance widths, in em. Slightly generous so
// wrapped lines never overflow the card.
function charWidth(char: string) {
  if (" .,:;'!|il".includes(char)) return 0.28;
  if ("fjrt()[]-".includes(char)) return 0.38;
  if ("mwMW@".includes(char)) return 0.86;
  if (/[A-Z]/.test(char)) return 0.66;
  if (/[0-9]/.test(char)) return 0.6;
  return 0.56;
}

function textWidth(text: string, fontSize: number) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width * fontSize;
}

export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && textWidth(`${last}…`, fontSize) > maxWidth) {
    last = last.replace(/\s*\S+$/, "");
  }
  kept[maxLines - 1] = `${last || kept[maxLines - 1]}…`;
  return kept;
}

function textLines(lines: string[], x: number, firstBaseline: number, lineHeight: number) {
  return lines
    .map((line, index) => `<tspan x="${x}" y="${firstBaseline + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
}

export function renderOgSvg(card: OgCard): string {
  const accent = /^#[0-9a-f]{3,8}$/i.test(card.accent) ? card.accent : DEFAULT_ACCENT;
  const hasLogo = Boolean(card.logoDataUri);
  const nameX = hasLogo ? PAD + 72 : PAD;

  let baseline = 250;
  const parts: string[] = [];

  if (card.eyebrow) {
    parts.push(
      `<text x="${PAD}" y="${baseline}" font-size="24" font-weight="500" letter-spacing="3" fill="${accent}">${escapeXml(card.eyebrow.toUpperCase())}</text>`
    );
    baseline += 78;
  } else {
    baseline += 30;
  }

  const titleSize = 68;
  const titleLineHeight = 78;
  const titleLines = wrapText(card.title, titleSize, TEXT_WIDTH, 3);
  parts.push(
    `<text font-size="${titleSize}" font-weight="500" letter-spacing="-1.5" fill="#f5f5f5">${textLines(titleLines, PAD, baseline, titleLineHeight)}</text>`
  );
  baseline += (titleLines.length - 1) * titleLineHeight;

  const descriptionLimit = 520;
  const descriptionLineHeight = 42;
  const descriptionStart = baseline + 62;
  const maxDescriptionLines = Math.max(0, Math.min(2, Math.floor((descriptionLimit - descriptionStart) / descriptionLineHeight) + 1));
  const showDescription = card.description && card.description.trim() !== card.title.trim();
  if (showDescription && maxDescriptionLines > 0) {
    const descriptionLines = wrapText(card.description ?? "", 30, TEXT_WIDTH, maxDescriptionLines);
    parts.push(
      `<text font-size="30" font-weight="400" fill="#a3a3a3">${textLines(descriptionLines, PAD, descriptionStart, descriptionLineHeight)}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Space Grotesk">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#141414"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" fill="none" stroke="#2a2a2a"/>
  ${hasLogo ? `<image href="${card.logoDataUri}" x="${PAD}" y="${PAD - 4}" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <text x="${nameX}" y="${PAD + 36}" font-size="34" font-weight="500" letter-spacing="-0.5" fill="#f5f5f5">${escapeXml(card.siteName)}</text>
  ${parts.join("\n  ")}
  ${card.host ? `<text x="${PAD}" y="${HEIGHT - PAD + 10}" font-size="24" font-weight="400" fill="#737373">${escapeXml(card.host)}</text>` : ""}
  <rect x="0" y="${HEIGHT - 10}" width="${WIDTH}" height="10" fill="${accent}"/>
</svg>`;
}

function readMeta(html: string, attribute: "name" | "property", key: string) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`, "i");
  const value = pattern.exec(html)?.[1];
  return value === undefined ? undefined : decodeEntities(value);
}

function readCategory(html: string) {
  const match = /<[^>]+data-pagefind-meta="category"[^>]*>([^<]*)</i.exec(html);
  return match ? decodeEntities(match[1]).trim() || undefined : undefined;
}

function readAccent(html: string) {
  const style = /<html[^>]*\sstyle="([^"]*)"/i.exec(html)?.[1] ?? "";
  const dark = /--site-accent-dark:\s*([^;"]+)/i.exec(style)?.[1]?.trim();
  const light = /--site-accent:\s*([^;"]+)/i.exec(style)?.[1]?.trim();
  return dark ?? light ?? DEFAULT_ACCENT;
}

const IMAGE_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

async function readLogo(distDir: string, html: string) {
  const src = /class="brand__logo"[^>]*>\s*<img[^>]*\ssrc="([^"]+)"/i.exec(html)?.[1];
  if (!src || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) return undefined;
  const type = IMAGE_TYPES[extname(src.split("?")[0]).toLowerCase()];
  if (!type) return undefined;
  const file = await readFile(join(distDir, decodeURIComponent(src.split("?")[0]).replace(/^\/+/, ""))).catch(() => undefined);
  return file ? `data:${type};base64,${file.toString("base64")}` : undefined;
}

async function listHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

export interface WriteOgImagesOptions {
  dir: URL;
  site?: URL;
  logger: OgImageLogger;
}

export async function writeOgImages({ dir, site, logger }: WriteOgImagesOptions) {
  const distDir = fileURLToPath(dir);
  const jobs: Array<{ output: string; card: OgCard }> = [];
  const logoCache = new Map<string, Promise<string | undefined>>();

  for (const file of await listHtmlFiles(distDir)) {
    const html = await readFile(file, "utf8");
    const image = readMeta(html, "property", "og:image");
    if (!image) continue;

    const imagePath = new URL(image, site ?? "https://zuedocs.invalid").pathname;
    if (!imagePath.startsWith(OG_IMAGE_PREFIX)) continue;

    const logoKey = /class="brand__logo"[^>]*>\s*<img[^>]*\ssrc="([^"]+)"/i.exec(html)?.[1] ?? "";
    if (!logoCache.has(logoKey)) logoCache.set(logoKey, readLogo(distDir, html));

    jobs.push({
      output: join(distDir, decodeURIComponent(imagePath).replace(/^\/+/, "")),
      card: {
        siteName: readMeta(html, "property", "og:site_name") ?? "",
        title: readMeta(html, "property", "og:title") ?? "",
        description: readMeta(html, "property", "og:description"),
        eyebrow: readCategory(html),
        host: site?.host,
        accent: readAccent(html),
        logoDataUri: await logoCache.get(logoKey)
      }
    });
  }

  if (jobs.length === 0) return;

  // renderAsync runs on libuv's thread pool, so a few renders in flight at
  // once use several cores instead of rendering one image at a time.
  const renderOptions: ResvgRenderOptions = {
    fitTo: { mode: "width", value: WIDTH },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: "Space Grotesk"
    }
  };
  const directories = new Set(jobs.map((job) => dirname(job.output)));
  await Promise.all([...directories].map((directory) => mkdir(directory, { recursive: true })));

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const image = await renderAsync(renderOgSvg(job.card), renderOptions);
      await writeFile(job.output, image.asPng());
    }
  };
  const concurrency = Math.max(1, Math.min(4, availableParallelism() - 1, jobs.length));
  await Promise.all(Array.from({ length: concurrency }, worker));

  logger.info(`[zuedocs] Rendered ${jobs.length} social preview images to ${OG_IMAGE_PREFIX}`);
}
