import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  renderSitemapXml,
  resolveSitemapSite,
  writeSitemap,
  type SitemapLogger
} from "../src/integrations/sitemap.ts";

const temporaryDirectories: string[] = [];

const logger: SitemapLogger = {
  info() {},
  warn() {}
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("resolveSitemapSite", () => {
  test("prefers an explicit Astro site over deployment environment variables", () => {
    expect(resolveSitemapSite({
      astroSite: "https://docs.example.com",
      env: {
        VERCEL_PROJECT_PRODUCTION_URL: "vercel.example.com",
        CF_PAGES_URL: "https://cloudflare.example.com"
      }
    })).toEqual({
      url: new URL("https://docs.example.com"),
      source: "astro"
    });
  });

  test("uses Vercel's production project domain without consumer configuration", () => {
    expect(resolveSitemapSite({
      env: { VERCEL_PROJECT_PRODUCTION_URL: "docs.example.com" }
    })).toEqual({
      url: new URL("https://docs.example.com"),
      source: "vercel"
    });
  });

  test("falls back to the Cloudflare Pages deployment URL", () => {
    expect(resolveSitemapSite({
      env: { CF_PAGES_URL: "https://docs-project.pages.dev" }
    })).toEqual({
      url: new URL("https://docs-project.pages.dev"),
      source: "cloudflare-pages"
    });
  });

  test("returns undefined when no valid deployed URL is available", () => {
    expect(resolveSitemapSite({ env: {} })).toBeUndefined();
    expect(resolveSitemapSite({
      env: { VERCEL_PROJECT_PRODUCTION_URL: "https://" }
    })).toBeUndefined();
  });
});

describe("renderSitemapXml", () => {
  test("renders unique generated pages while excluding raw markdown and error pages", () => {
    const xml = renderSitemapXml([
      { pathname: "" },
      { pathname: "/docs" },
      { pathname: "/docs/quickstart" },
      { pathname: "/docs/quickstart" },
      { pathname: "/docs/quickstart.md" },
      { pathname: "/404" },
      { pathname: "/500.html" }
    ], new URL("https://docs.example.com"));

    expect(xml).toContain("<loc>https://docs.example.com/</loc>");
    expect(xml).toContain("<loc>https://docs.example.com/docs</loc>");
    expect(xml).toContain("<loc>https://docs.example.com/docs/quickstart</loc>");
    expect(xml.match(/docs\/quickstart<\/loc>/g)).toHaveLength(1);
    expect(xml).not.toContain("quickstart.md");
    expect(xml).not.toContain("/404");
    expect(xml).not.toContain("/500");
  });

  test("escapes URL characters that are significant in XML", () => {
    const xml = renderSitemapXml(
      [{ pathname: "/docs/a&b" }],
      new URL("https://docs.example.com")
    );

    expect(xml).toContain("https://docs.example.com/docs/a&amp;b");
  });
});

describe("writeSitemap", () => {
  test("writes sitemap.xml into the supplied Astro output directory", async () => {
    const output = await mkdtemp(join(tmpdir(), "zuedocs-sitemap-"));
    temporaryDirectories.push(output);
    const infoMessages: string[] = [];

    const result = await writeSitemap({
      dir: pathToFileURL(`${output}/`),
      pages: [
        { pathname: "" },
        { pathname: "/docs" },
        { pathname: "/docs/getting-started" },
        { pathname: "/docs/getting-started.md" }
      ],
      site: new URL("https://docs.example.com"),
      logger: { ...logger, info: (message) => infoMessages.push(message) }
    });

    expect(result).toEqual({
      outputPath: join(output, "sitemap.xml"),
      pageCount: 3
    });
    expect(await readFile(result.outputPath, "utf8")).toContain(
      "<loc>https://docs.example.com/docs/getting-started</loc>"
    );
    expect(infoMessages).toEqual([
      `[zuedocs] Wrote sitemap for 3 pages to ${join(output, "sitemap.xml")}`
    ]);
  });
});
