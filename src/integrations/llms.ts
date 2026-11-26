import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface LlmsLogger {
  info(message: string): void;
  warn(message: string): void;
}

interface IndexLink {
  title: string;
  href: string;
  description: string;
}

interface IndexSection {
  title: string;
  links: IndexLink[];
}

const LINK_LINE = /^-\s+\[([^\]]+)\]\(([^)\s]+)\)(?::\s*(.*))?$/;

function readMeta(html: string, attribute: "name" | "property", key: string) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`, "i");
  const reversed = new RegExp(`<meta\\s+content="([^"]*)"\\s+${attribute}="${key}"`, "i");
  const value = pattern.exec(html)?.[1] ?? reversed.exec(html)?.[1];
  return value
    ?.replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseDocsIndex(markdown: string) {
  const sections: IndexSection[] = [];
  let heading = "";
  let current: IndexSection | undefined;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("# ") && !heading) {
      heading = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), links: [] };
      sections.push(current);
    } else {
      const match = LINK_LINE.exec(line);
      if (!match) continue;
      if (!current) {
        current = { title: "Docs", links: [] };
        sections.push(current);
      }
      current.links.push({ title: match[1], href: match[2], description: match[3]?.trim() ?? "" });
    }
  }

  return { heading, sections: sections.filter((section) => section.links.length > 0) };
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function absolute(href: string, site?: URL) {
  return site ? new URL(href, site).toString() : href;
}

export interface WriteLlmsFilesOptions {
  dir: URL;
  site?: URL;
  logger: LlmsLogger;
}

export async function writeLlmsFiles({ dir, site, logger }: WriteLlmsFilesOptions) {
  const distDir = fileURLToPath(dir);
  let indexMarkdown: string;
  try {
    indexMarkdown = await readFile(join(distDir, "docs.md"), "utf8");
  } catch {
    logger.warn("[zuedocs] Skipped llms.txt because /docs.md was not built.");
    return;
  }

  const homeHtml = await readFile(join(distDir, "index.html"), "utf8").catch(() => "");
  const { heading, sections } = parseDocsIndex(indexMarkdown);
  const siteName = readMeta(homeHtml, "property", "og:site_name") || heading.replace(/\s+Docs$/i, "") || "Docs";
  const description = readMeta(homeHtml, "name", "description");

  const summary = [`# ${siteName}`, ""];
  if (description) summary.push(`> ${description}`, "");
  summary.push(
    `Each link points to the raw Markdown version of a docs page. The full text of every page is in [llms-full.txt](${absolute("/llms-full.txt", site)}).`,
    ""
  );
  for (const section of sections) {
    summary.push(`## ${section.title}`, "");
    for (const link of section.links) {
      const suffix = link.description ? `: ${link.description}` : "";
      summary.push(`- [${link.title}](${absolute(link.href, site)})${suffix}`);
    }
    summary.push("");
  }

  const full = [`# ${siteName}`, ""];
  if (description) full.push(`> ${description}`, "");
  let pageCount = 0;
  for (const section of sections) {
    for (const link of section.links) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link.href)) continue;
      const path = join(distDir, decodeURIComponent(link.href.split("#")[0]).replace(/^\/+/, ""));
      const source = await readFile(path, "utf8").catch(() => undefined);
      if (source === undefined) continue;
      pageCount += 1;
      full.push("---", "", `# ${link.title}`, "", `Source: ${absolute(link.href, site)}`, "", stripFrontmatter(source), "");
    }
  }

  await writeFile(join(distDir, "llms.txt"), `${summary.join("\n").trimEnd()}\n`);
  await writeFile(join(distDir, "llms-full.txt"), `${full.join("\n").trimEnd()}\n`);
  logger.info(`[zuedocs] Wrote llms.txt and llms-full.txt for ${pageCount} pages`);
}
