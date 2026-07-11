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

function fakeApi({
  createErrors = [],
  addErrors = [],
  pageCount = 1,
  writeErrors = []
}: {
  createErrors?: string[];
  addErrors?: string[];
  pageCount?: number;
  writeErrors?: string[];
} = {}) {
  let deleted = false;
  let closed = false;

  const index = {
    async addDirectory() {
      return { errors: addErrors, page_count: pageCount };
    },
    async writeFiles({ outputPath }: { outputPath: string }) {
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
  test("indexes generated HTML into the supplied non-default output directory", async () => {
    const output = await temporaryOutput();
    await writeFile(join(output, "docs", "index.html"), `<!doctype html>
      <html lang="en">
        <body>
          <header data-pagefind-ignore>shellonlyuniqueterm</header>
          <main><h1>Article</h1><p>articleonlyuniqueterm</p></main>
        </body>
      </html>`);
    await writeFile(join(output, "docs", "source.md"), "markdownonlyuniqueterm");

    const result = await indexPagefindSite({ dir: pathToFileURL(`${output}/`), logger });
    const bundleFiles = await allFiles(result.outputPath);
    const relativeFiles = bundleFiles.map((path) => path.slice(result.outputPath.length + 1));

    expect(result).toEqual({ outputPath: join(output, "pagefind"), pageCount: 1 });
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
    expect(indexedText).not.toContain("shellonlyuniqueterm");
    expect(indexedText).not.toContain("markdownonlyuniqueterm");
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
});
