import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "zuedocs-scaffold-smoke-"));
const scaffoldRoot = join(temporaryRoot, "starter-docs");

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(" ")}`);
  }
}

try {
  const packResult = Bun.spawnSync({
    cmd: ["npm", "pack", "--json", "--pack-destination", temporaryRoot],
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "inherit",
    env: process.env
  });
  if (packResult.exitCode !== 0) {
    throw new Error(`npm pack failed with exit code ${packResult.exitCode}`);
  }

  const packOutput = JSON.parse(packResult.stdout.toString()) as Array<{ filename: string }>;
  const tarballPath = join(temporaryRoot, packOutput[0].filename);

  run([process.execPath, join(packageRoot, "bin/zuedocs.js"), "init", scaffoldRoot], temporaryRoot);

  const config = await readFile(join(scaffoldRoot, "astro.config.mjs"), "utf8");
  if (!config.includes('import zueDocs from "zuedocs/astro";') ||
      !config.includes("integrations: [zueDocs()]")) {
    throw new Error("Generated Astro config does not register zueDocs()");
  }

  const manifestPath = join(scaffoldRoot, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const declaredPackages = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies)
  ];
  if (declaredPackages.some((name) => name.includes("pagefind"))) {
    throw new Error("Generated manifest must not declare Pagefind directly");
  }
  manifest.devDependencies.zuedocs = `file:${tarballPath}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  run(["bun", "install"], scaffoldRoot);

  const exportScript = join(scaffoldRoot, "verify-package-export.mjs");
  await writeFile(exportScript, `
import * as integration from "zuedocs/astro";
const exported = Object.keys(integration).sort();
if (JSON.stringify(exported) !== JSON.stringify(["default"])) {
  throw new Error(\`Expected only the default zuedocs/astro export, received: \${exported.join(", ")}\`);
}
if (typeof integration.default !== "function") {
  throw new Error("The packed zuedocs/astro default export is not a function");
}
`, "utf8");
  run(["bun", exportScript], scaffoldRoot);

  run(["bun", "run", "check"], scaffoldRoot);
  run(["bun", "run", "build"], scaffoldRoot);

  const builtHome = await readFile(join(scaffoldRoot, "dist/index.html"), "utf8");
  if (!builtHome.includes("data-docs-search")) {
    throw new Error("Generated production site does not include the shared search UI");
  }
  await Promise.all([
    readFile(join(scaffoldRoot, "dist/pagefind/pagefind-entry.json"), "utf8"),
    readFile(join(scaffoldRoot, "dist/pagefind/pagefind.js"), "utf8"),
    readFile(join(scaffoldRoot, "dist/pagefind/pagefind-worker.js"), "utf8")
  ]);

  const queryScript = join(temporaryRoot, "query-pagefind.mjs");
  await writeFile(queryScript, `
import * as pagefind from ${JSON.stringify(join(scaffoldRoot, "dist/pagefind/pagefind.js"))};
await pagefind.options({ baseUrl: "/" });
await pagefind.init();
const result = await pagefind.search("What to customize first");
const pages = await Promise.all(result.results.map((entry) => entry.data()));
if (!pages.some((page) => page.url === "/docs/quickstart/")) {
  throw new Error(\`Expected quickstart result, received: \${pages.map((page) => page.url).join(", ")}\`);
}
if (pages.some((page) => page.url.includes("file:") || page.url.includes(${JSON.stringify(scaffoldRoot)}))) {
  throw new Error(\`Search returned a filesystem-derived URL: \${pages.map((page) => page.url).join(", ")}\`);
}
`, "utf8");
  run(["bun", queryScript], scaffoldRoot);

  console.log("Packed scaffold check/build and Pagefind query smoke passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
