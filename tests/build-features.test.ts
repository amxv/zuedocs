import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { rehypeDocsCallouts, transformBlockquote } from "../src/integrations/callouts.ts";
import { extractHrefs, extractIds, findBrokenLinks } from "../src/integrations/linkCheck.ts";
import { parseDocsIndex, writeLlmsFiles } from "../src/integrations/llms.ts";
import { renderOgSvg, wrapText } from "../src/integrations/ogImages.ts";
import { collectDocsRedirects, docIdForPath, parseRedirectFrontmatter } from "../src/integrations/redirects.ts";
import { ogImagePathForPage, pageTitleForSocial } from "../src/seo.ts";

const temporaryDirectories: string[] = [];
const logger = { info() {}, warn() {}, error() {} };

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeSite(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "zuedocs-features-"));
  temporaryDirectories.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return dir;
}

const text = (value: string) => ({ type: "text", value });
const element = (tagName: string, children: object[] = []) => ({ type: "element", tagName, properties: {}, children });

describe("callouts", () => {
  test("turns a GitHub alert blockquote into a callout", () => {
    const node = element("blockquote", [text("\n"), element("p", [text("[!WARNING]\nDeletes the disk.")]), text("\n")]);
    expect(transformBlockquote(node)).toBe(true);
    expect(node.tagName).toBe("div");
    expect(node.properties).toEqual({ className: ["docs-callout", "docs-callout--warning"], role: "note" });
    expect(JSON.stringify(node.children)).toContain("Warning");
    expect(JSON.stringify(node.children)).toContain("Deletes the disk.");
    expect(JSON.stringify(node.children)).not.toContain("[!WARNING]");
  });

  test("drops a paragraph that only held the marker", () => {
    const node = element("blockquote", [element("p", [text("[!NOTE]")]), element("p", [text("Body")])]);
    transformBlockquote(node);
    const paragraphs = node.children.filter((child) => "tagName" in child && child.tagName === "p");
    expect(paragraphs).toHaveLength(2);
    expect(JSON.stringify(paragraphs[1])).toContain("Body");
  });

  test("leaves ordinary quotes alone", () => {
    const tree = { type: "root", children: [element("blockquote", [element("p", [text("Just a quote")])])] };
    rehypeDocsCallouts()(tree);
    expect(tree.children[0].tagName).toBe("blockquote");
  });
});

describe("link check", () => {
  test("ignores hrefs inside script templates", () => {
    const html = `<a href="/a">A</a><script type="text/template"><a href="{{ url }}"></a></script><h2 id="x"></h2>`;
    expect(extractHrefs(html)).toEqual(["/a"]);
    expect([...extractIds(html)]).toEqual(["x"]);
  });

  test("reports missing pages and anchors but not valid links", async () => {
    const dir = await makeSite({
      "index.html": `<a href="/docs/install">ok</a><a href="/docs/install#setup">ok</a><a href="/docs/gone">bad</a><a href="/docs/install#nope">bad</a><a href="https://example.com/x">ext</a><a href="/llms.txt">file</a>`,
      "docs/install/index.html": `<h2 id="setup">Setup</h2><a href="#setup">self</a><a href="../install">rel</a>`,
      "llms.txt": "index"
    });
    const broken = await findBrokenLinks({ dir: pathToFileURL(`${dir}/`) });
    expect(broken).toEqual([
      { page: "/", href: "/docs/gone", reason: "missing-page" },
      { page: "/", href: "/docs/install#nope", reason: "missing-anchor" }
    ]);
  });
});

describe("llms.txt", () => {
  const index = "# Demo Docs\n\nintro\n\n## Start\n\n- [Install](/docs/install.md): Get it running.\n";

  test("parses the docs Markdown index", () => {
    expect(parseDocsIndex(index)).toEqual({
      heading: "Demo Docs",
      sections: [{ title: "Start", links: [{ title: "Install", href: "/docs/install.md", description: "Get it running." }] }]
    });
  });

  test("writes a link index and a full-text file", async () => {
    const dir = await makeSite({
      "docs.md": index,
      "docs/install.md": "---\ntitle: Install\n---\n\nRun the installer.\n",
      "index.html": `<meta property="og:site_name" content="Demo"><meta name="description" content="Demo &amp; docs">`
    });
    await writeLlmsFiles({ dir: pathToFileURL(`${dir}/`), site: new URL("https://demo.dev"), logger });

    const llms = await readFile(join(dir, "llms.txt"), "utf8");
    expect(llms).toStartWith("# Demo\n\n> Demo & docs\n");
    expect(llms).toContain("- [Install](https://demo.dev/docs/install.md): Get it running.");
    expect(llms).not.toContain("Run the installer.");

    const full = await readFile(join(dir, "llms-full.txt"), "utf8");
    expect(full).toContain("# Install\n\nSource: https://demo.dev/docs/install.md\n\nRun the installer.");
    expect(full).not.toContain("title: Install");
  });
});

describe("redirects", () => {
  test("parses block, inline, and single redirectFrom values", () => {
    expect(parseRedirectFrontmatter("---\ntitle: A\nredirectFrom:\n  - /docs/a\n  - \"/docs/b\"\n---\n").redirectFrom).toEqual(["/docs/a", "/docs/b"]);
    expect(parseRedirectFrontmatter("---\nredirect_from: [/docs/a, '/docs/b']\n---\n").redirectFrom).toEqual(["/docs/a", "/docs/b"]);
    expect(parseRedirectFrontmatter("---\nredirectFrom: /docs/a\nslug: new\n---\n")).toEqual({ redirectFrom: ["/docs/a"], slug: "new" });
  });

  test("maps old URLs to the page's docs route", async () => {
    expect(docIdForPath("guides/Getting Started.md")).toBe("guides/getting-started");
    const root = await makeSite({
      "src/content/docs/install.md": "---\ntitle: Install\nredirectFrom:\n  - /docs/setup/\n---\n",
      "src/content/docs/other.md": "---\ntitle: Other\n---\n"
    });
    expect(await collectDocsRedirects({ root: pathToFileURL(`${root}/`) })).toEqual({ "/docs/setup": "/docs/install" });
  });
});

describe("social previews", () => {
  test("maps pages to generated image paths", () => {
    expect(ogImagePathForPage("/")).toBe("/og/index.png");
    expect(ogImagePathForPage("/docs/install/")).toBe("/og/docs/install.png");
  });

  test("removes the site name from page titles", () => {
    expect(pageTitleForSocial("Install | Demo Docs", "Demo")).toBe("Install");
    expect(pageTitleForSocial("Demo | Fast builds", "Demo")).toBe("Fast builds");
    expect(pageTitleForSocial("Demo", "Demo")).toBe("Demo");
  });

  test("wraps and truncates long text", () => {
    const lines = wrapText("word ".repeat(80), 30, 400, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEndWith("…");
  });

  test("escapes text in the SVG", () => {
    const svg = renderOgSvg({ siteName: "A&B", title: "<script>", description: "x", accent: "#123456" });
    expect(svg).toContain("A&amp;B");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});
