import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("zuedocs init", () => {
  test("generates a static site registered with the first-party integration", async () => {
    const root = await mkdtemp(join(tmpdir(), "zuedocs-scaffold-test-"));
    temporaryDirectories.push(root);

    const result = Bun.spawnSync({
      cmd: [process.execPath, join(packageRoot, "bin/zuedocs.js"), "init", "starter-docs"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe"
    });

    expect(result.exitCode).toBe(0);

    const scaffoldRoot = join(root, "starter-docs");
    const config = await readFile(join(scaffoldRoot, "astro.config.mjs"), "utf8");
    const manifest = JSON.parse(
      await readFile(join(scaffoldRoot, "package.json"), "utf8")
    ) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const siteConfig = await readFile(join(scaffoldRoot, "src/data/docs.ts"), "utf8");

    expect(config).toContain('import zueDocs from "zuedocs/astro";');
    expect(config).toContain('output: "static"');
    expect(config).toContain("integrations: [zueDocs()]");
    expect(manifest.scripts).toEqual({
      dev: "astro dev",
      build: "astro build",
      preview: "astro preview",
      check: "astro check"
    });
    expect(Object.keys(manifest.devDependencies).sort()).toEqual([
      "@astrojs/check",
      "@types/node",
      "astro",
      "typescript",
      "zuedocs"
    ]);
    expect(JSON.stringify(manifest)).not.toContain("pagefind");
    expect(siteConfig).not.toContain("search");
    expect(siteConfig).not.toContain("pagefind");
  });
});
