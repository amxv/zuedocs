import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import type { PagefindIndex } from "pagefind";

import {
  indexPagefindSite,
  type PagefindApi,
  type PagefindLogger
} from "../src/integrations/pagefind.ts";

const temporaryDirectories: string[] = [];

const logger: PagefindLogger = {
  info() {},
  warn() {},
  error() {}
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryOutput(name = "custom-output"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zuedocs-pagefind-"));
  temporaryDirectories.push(root);
  const output = join(root, name);
  await mkdir(join(output, "docs"), { recursive: true });
  return output;
}

async function allFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  }));
  return nested.flat();
}

async function queryIndex(
  bundlePath: string,
  query: string
): Promise<Array<{
  url: string;
  excerpt: string;
  meta: Record<string, string>;
  sub_results?: Array<{ url: string; title: string; excerpt: string }>;
}>> {
  const pagefind = await import(`${pathToFileURL(join(bundlePath, "pagefind.js")).href}?test=${encodeURIComponent(query)}`);
  await pagefind.options({ baseUrl: "/" });
  await pagefind.init();
  const search = await pagefind.search(query);
  return Promise.all(search.results.map((entry: { data(): Promise<unknown> }) => entry.data()));
}

function fakeApi({
  createErrors = [],
  addErrors = [],
  pageCount = 1,
  writeErrors = [],
  entryMetadata = { languages: { en: { page_count: 1 } } },
  entryMetadataContents,
  writeEntryMetadata = true
}: {
  createErrors?: string[];
  addErrors?: string[];
  pageCount?: number;
  writeErrors?: string[];
  entryMetadata?: unknown;
  entryMetadataContents?: string;
  writeEntryMetadata?: boolean;
} = {}) {
  let deleted = false;
  let closed = false;

  const index = {
    async addDirectory() {
      return { errors: addErrors, page_count: pageCount };
    },
    async writeFiles({ outputPath }: { outputPath: string }) {
      if (writeErrors.length === 0 && writeEntryMetadata) {
        await mkdir(outputPath, { recursive: true });
        await writeFile(
          join(outputPath, "pagefind-entry.json"),
          entryMetadataContents ?? JSON.stringify(entryMetadata)
        );
      }
      return { errors: writeErrors, outputPath };
    },
    async deleteIndex() {
      deleted = true;
      return null;
    }
  } as unknown as PagefindIndex;

  const api: PagefindApi = {
    async createIndex() {
      return createErrors.length > 0 ? { errors: createErrors } : { errors: [], index };
    },
    async close() {
      closed = true;
      return null;
    }
  };

  return {
    api,
    wasClosed: () => closed,
    wasDeleted: () => deleted
  };
}

describe("indexPagefindSite", () => {
  test("indexes only the annotated docs body into the supplied non-default output directory", async () => {
    const output = await temporaryOutput();
    await mkdir(join(output, "docs", "guides"), { recursive: true });
    await writeFile(join(output, "docs", "guides", "index.html"), `<!doctype html>
      <html lang="en">
        <body>
          <header>headeronlyuniqueterm</header>
          <aside>sidebaronlyuniqueterm</aside>
          <main data-pagefind-body>
            <p data-pagefind-meta="category">Reference</p>
            <h1 data-pagefind-meta="title">Searchable Guide</h1>
            <p data-pagefind-meta="description">A deterministic description for guide discovery.</p>
            <div data-pagefind-ignore>pageactiononlyuniqueterm</div>
            <h2 id="configuration">Configuration details</h2>
            <p>articleonlyuniqueterm explains the rendered documentation contract.</p>
            <pre><code>zuedocs_identifier._value</code></pre>
          </main>
          <footer>footeronlyuniqueterm</footer>
        </body>
      </html>`);
    await writeFile(join(output, "index.html"), `<!doctype html>
      <html lang="en"><body><main><h1>Home</h1><p>marketingonlyuniqueterm</p></main></body></html>`);
    await writeFile(join(output, "docs", "index.html"), `<!doctype html>
      <html lang="en"><body><main><h1>Docs home</h1><p>docslandingonlyuniqueterm</p></main></body></html>`);
    await writeFile(join(output, "docs", "source.md"), "markdownonlyuniqueterm");

    const infoMessages: string[] = [];
    const result = await indexPagefindSite({
      dir: pathToFileURL(`${output}/`),
      logger: { ...logger, info: (message) => infoMessages.push(message) }
    });
    const bundleFiles = await allFiles(result.outputPath);
    const relativeFiles = bundleFiles.map((path) => path.slice(result.outputPath.length + 1));

    expect(result).toEqual({ outputPath: join(output, "pagefind"), pageCount: 1 });
    expect(infoMessages).toEqual([`[zuedocs] Indexed 1 page to ${join(output, "pagefind")}`]);
    expect(relativeFiles).toContain("pagefind.js");
    expect(relativeFiles).toContain("pagefind-entry.json");
    expect(relativeFiles.some((path) => /^wasm\..+\.pagefind$/.test(path))).toBe(true);
    expect(relativeFiles.some((path) => path.endsWith(".pf_meta"))).toBe(true);
    expect(relativeFiles.some((path) => path.startsWith("index/") && path.endsWith(".pf_index"))).toBe(true);
    expect(relativeFiles.some((path) => path.startsWith("fragment/") && path.endsWith(".pf_fragment"))).toBe(true);

    const indexFiles = bundleFiles.filter((path) => path.endsWith(".pf_index"));
    const indexedText = (await Promise.all(indexFiles.map(async (path) => {
      return gunzipSync(await readFile(path)).toString("utf8");
    }))).join("\n");

    expect(indexedText).toContain("articleonlyuniqueterm");
    expect(indexedText).not.toContain("headeronlyuniqueterm");
    expect(indexedText).not.toContain("sidebaronlyuniqueterm");
    expect(indexedText).not.toContain("footeronlyuniqueterm");
    expect(indexedText).not.toContain("pageactiononlyuniqueterm");
    expect(indexedText).not.toContain("marketingonlyuniqueterm");
    expect(indexedText).not.toContain("docslandingonlyuniqueterm");
    expect(indexedText).not.toContain("markdownonlyuniqueterm");

    const articleResults = await queryIndex(result.outputPath, "articleonlyuniqueterm");
    expect(articleResults).toHaveLength(1);
    expect(articleResults[0].url).toBe("/docs/guides/");
    expect(articleResults[0].meta).toMatchObject({
      title: "Searchable Guide",
      category: "Reference",
      description: "A deterministic description for guide discovery."
    });
    expect(articleResults[0].excerpt).toContain("articleonlyuniqueterm");

    const headingResults = await queryIndex(result.outputPath, "Configuration details");
    expect(headingResults[0].sub_results?.some((entry) => {
      return entry.title === "Configuration details" && entry.url === "/docs/guides/#configuration";
    })).toBe(true);

    const identifierResults = await queryIndex(result.outputPath, "zuedocs_identifier._value");
    expect(identifierResults).toHaveLength(1);

    for (const excludedTerm of [
      "headeronlyuniqueterm",
      "sidebaronlyuniqueterm",
      "footeronlyuniqueterm",
      "pageactiononlyuniqueterm",
      "marketingonlyuniqueterm",
      "docslandingonlyuniqueterm",
      "markdownonlyuniqueterm"
    ]) {
      expect(await queryIndex(result.outputPath, excludedTerm)).toEqual([]);
    }

    const allSearchableResults = [articleResults, headingResults, identifierResults].flat();
    expect(allSearchableResults.every((entry) => {
      return entry.url.startsWith("/docs/") &&
        !entry.url.endsWith(".md") &&
        !entry.url.includes("file:") &&
        !entry.url.includes(output);
    })).toBe(true);
  });

  test("fails when Pagefind scans docs HTML but emits no searchable documents", async () => {
    const output = await temporaryOutput();
    const errorMessages: string[] = [];
    await writeFile(join(output, "docs", "index.html"), `<!doctype html>
      <html lang="en"><body><main><h1>Unannotated docs home</h1></main></body></html>`);

    await expect(indexPagefindSite({
      dir: pathToFileURL(`${output}/`),
      logger: { ...logger, error: (message) => errorMessages.push(message) }
    })).rejects.toThrow(
      "[zuedocs] Pagefind HTML indexing failed: zero searchable documentation pages were emitted"
    );
    expect(errorMessages).toEqual([
      "[zuedocs] Pagefind HTML indexing failed: zero searchable documentation pages were emitted"
    ]);
  });

  test.each([
    ["index creation", { createErrors: ["create exploded"] }, false],
    ["HTML indexing", { addErrors: ["add exploded"] }, true],
    ["HTML indexing", { pageCount: 0 }, true],
    ["bundle write", { writeErrors: ["write exploded"] }, true]
  ] as const)("fails during %s and always cleans up", async (stage, setup, expectsDelete) => {
    const output = await temporaryOutput();
    const fake = fakeApi(setup);

    await expect(indexPagefindSite({
      dir: pathToFileURL(`${output}/`),
      logger,
      pagefindApi: fake.api
    })).rejects.toThrow(`[zuedocs] Pagefind ${stage} failed`);

    expect(fake.wasClosed()).toBe(true);
    expect(fake.wasDeleted()).toBe(expectsDelete);
  });

  test.each([
    ["missing", { writeEntryMetadata: false }],
    ["malformed", { entryMetadataContents: "{" }],
    ["missing languages", { entryMetadata: {} }],
    ["invalid language metadata", { entryMetadata: { languages: { en: null } } }],
    ["invalid page count", { entryMetadata: { languages: { en: { page_count: "1" } } } }]
  ] as const)("fails for %s emitted bundle metadata and always cleans up", async (_case, setup) => {
    const output = await temporaryOutput();
    const fake = fakeApi(setup);
    const errorMessages: string[] = [];

    await expect(indexPagefindSite({
      dir: pathToFileURL(`${output}/`),
      logger: { ...logger, error: (message) => errorMessages.push(message) },
      pagefindApi: fake.api
    })).rejects.toThrow("[zuedocs] Pagefind bundle metadata failed");

    expect(errorMessages).toHaveLength(1);
    expect(errorMessages[0]).toStartWith("[zuedocs] Pagefind bundle metadata failed:");
    expect(fake.wasClosed()).toBe(true);
    expect(fake.wasDeleted()).toBe(true);
  });

  test("uses the summed emitted language page counts", async () => {
    const output = await temporaryOutput();
    const fake = fakeApi({
      pageCount: 7,
      entryMetadata: {
        languages: {
          en: { page_count: 2 },
          fr: { page_count: 1 }
        }
      }
    });

    await expect(indexPagefindSite({
      dir: pathToFileURL(`${output}/`),
      logger,
      pagefindApi: fake.api
    })).resolves.toEqual({ outputPath: join(output, "pagefind"), pageCount: 3 });

    expect(fake.wasClosed()).toBe(true);
    expect(fake.wasDeleted()).toBe(true);
  });
});
