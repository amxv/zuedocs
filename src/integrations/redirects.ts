import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Lets a renamed docs page keep its old URLs working:
//
//   ---
//   title: Install
//   redirectFrom:
//     - /docs/setup
//     - /docs/getting-started
//   ---
//
// The integration turns these into Astro `redirects`, which static builds emit
// as small redirect pages.

const CONTENT_EXTENSIONS = /\.(md|mdx)$/i;

export interface DocsRedirectOptions {
  root: URL;
  contentDir?: string;
  docsBase?: string;
}

function slugifySegment(segment: string) {
  return segment
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function docIdForPath(relativePath: string) {
  return relativePath
    .replace(CONTENT_EXTENSIONS, "")
    .split(/[\\/]/)
    .map(slugifySegment)
    .join("/")
    .replace(/(^|\/)index$/, "");
}

function unquote(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// Reads `redirectFrom` (or `redirect_from`) and `slug` from YAML frontmatter.
// Supports a single value, an inline `[a, b]` list, and a block `- a` list.
export function parseRedirectFrontmatter(source: string) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  if (!block) return { redirectFrom: [] as string[], slug: undefined as string | undefined };

  const lines = block.split(/\r?\n/);
  const redirectFrom: string[] = [];
  let slug: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const slugMatch = /^slug:\s*(.+)$/.exec(lines[index]);
    if (slugMatch) slug = unquote(slugMatch[1]);

    const match = /^(?:redirectFrom|redirect_from):\s*(.*)$/.exec(lines[index]);
    if (!match) continue;

    const inline = match[1].trim();
    if (inline.startsWith("[")) {
      inline.replace(/^\[|\]$/g, "").split(",").map(unquote).filter(Boolean).forEach((value) => redirectFrom.push(value));
    } else if (inline) {
      redirectFrom.push(unquote(inline));
    } else {
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        redirectFrom.push(unquote(lines[index].replace(/^\s+-\s+/, "")));
      }
    }
  }

  return { redirectFrom: redirectFrom.filter(Boolean), slug };
}

function normalizeSource(path: string) {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export async function collectDocsRedirects({
  root,
  contentDir = "src/content/docs",
  docsBase = "/docs"
}: DocsRedirectOptions): Promise<Record<string, string>> {
  const dir = join(fileURLToPath(root), contentDir);
  let files: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    files = entries
      .filter((entry) => entry.isFile() && CONTENT_EXTENSIONS.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return {};
  }

  const redirects: Record<string, string> = {};
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { redirectFrom, slug } = parseRedirectFrontmatter(source);
    if (redirectFrom.length === 0) continue;

    const id = slug ?? docIdForPath(relative(dir, file).split(sep).join("/"));
    const target = id ? `${docsBase}/${id}` : docsBase;
    for (const from of redirectFrom) {
      const normalized = normalizeSource(from);
      if (normalized !== target) redirects[normalized] = target;
    }
  }
  return redirects;
}
