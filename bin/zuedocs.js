#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const packageVersion = packageJson.version;

function usage() {
  console.log(`Usage:
  zuedocs init [directory]
  create-zuedocs [directory]

Examples:
  bunx zuedocs init
  bunx zuedocs init my-docs
  bunx create-zuedocs my-docs`);
}

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function ensureEmptyDir(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(targetDir);
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }
}

async function write(targetDir, relativePath, contents) {
  const destination = path.join(targetDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

function packageJsonTemplate(projectName) {
  return `${JSON.stringify(
    {
      name: projectName.toLowerCase().replace(/\s+/g, "-"),
      version: "0.1.0",
      private: true,
      type: "module",
      packageManager: "bun@1.3.11",
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
        check: "astro check"
      },
      devDependencies: {
        "@astrojs/check": "^0.9.4",
        "@types/node": "^24.0.13",
        astro: "^7.0.3",
        typescript: "^5.9.2",
        zuedocs: `^${packageVersion}`
      }
    },
    null,
    2
  )}\n`;
}

function dataDocsTemplate(projectName, repoName) {
  return `export const siteConfig = {
  name: "${projectName}",
  strapline: "Documentation",
  description:
    "Documentation site for ${projectName}, scaffolded with zuedocs.",
  repoUrl: "https://github.com/your-org/${repoName}"
} as const;

export const docCategories = [
  "Start",
  "Guides",
  "Operations"
] as const;

export const primaryNav = [
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true }
];
`;
}

function contentConfigTemplate() {
  return `import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    category: z.enum(["Start", "Guides", "Operations"]),
    summary: z.string().optional()
  })
});

export const collections = { docs };
`;
}

function indexPageTemplate() {
  return `---
import BaseLayout from "zuedocs/layouts/BaseLayout.astro";
import { getCollection } from "astro:content";
import { primaryNav, siteConfig } from "../data/docs";

const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
---

<BaseLayout
  title={\`\${siteConfig.name} | \${siteConfig.strapline}\`}
  description={siteConfig.description}
  siteConfig={siteConfig}
  primaryNav={primaryNav}
>
  <section class="hero shell">
    <div class="hero__copy">
      <p class="section-label">Shared docs system</p>
      <h1>Ship a product docs site without rebuilding the presentation layer.</h1>
      <p class="hero__lede">
        This scaffold keeps the site-specific copy and markdown local while importing the shared docs shell from \`zuedocs\`.
      </p>
      <div class="hero__actions">
        <a class="button button--solid" href="/docs/quickstart">Read the quickstart</a>
        <a class="button button--ghost" href="/docs">Browse the docs</a>
      </div>
    </div>
    <aside class="hero__panel">
      <p class="hero__panel-label">What stays local</p>
      <ul class="hero__signal-list">
        <li>Your markdown docs content.</li>
        <li>Your site config and navigation labels.</li>
        <li>Your homepage and product narrative.</li>
      </ul>
      <div class="hero__terminal">
        <span>$ bun install</span>
        <span>$ bun run check</span>
        <span>$ bun run build</span>
      </div>
    </aside>
  </section>

  <section class="shell docs-teaser">
    <div class="section-heading">
      <p class="section-label">Starter guides</p>
      <h2>Replace these docs pages with your own product material.</h2>
    </div>
    <div class="docs-teaser__grid">
      {docs.map((entry) => (
        <a class="docs-teaser__card" href={\`/docs/\${entry.id}\`}>
          <span>{entry.data.category}</span>
          <h3>{entry.data.title}</h3>
          <p>{entry.data.summary ?? entry.data.description}</p>
        </a>
      ))}
    </div>
  </section>
</BaseLayout>
`;
}

function docsIndexTemplate() {
  return `---
import { getCollection } from "astro:content";
import BaseLayout from "zuedocs/layouts/BaseLayout.astro";
import { docCategories, primaryNav, siteConfig } from "../../data/docs";

const entries = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
const grouped = docCategories.map((category) => ({
  category,
  entries: entries.filter((entry) => entry.data.category === category)
}));
---

<BaseLayout
  title={\`\${siteConfig.name} Docs\`}
  description={siteConfig.description}
  siteConfig={siteConfig}
  primaryNav={primaryNav}
>
  <section class="shell docs-index-hero">
    <p class="section-label">Documentation</p>
    <h1>Start with a compact docs map, then fill in the product details.</h1>
    <p>
      These starter guides demonstrate the structure expected by the shared docs layouts.
    </p>
  </section>

  <section class="shell docs-index">
    {grouped.map((group) => (
      <section class="docs-index__group">
        <div class="docs-index__group-head">
          <p class="section-label">{group.category}</p>
        </div>
        <div class="docs-index__cards">
          {group.entries.map((entry) => (
            <a class="docs-index__card" href={\`/docs/\${entry.id}\`}>
              <h2>{entry.data.title}</h2>
              <p>{entry.data.description}</p>
            </a>
          ))}
        </div>
      </section>
    ))}
  </section>
</BaseLayout>
`;
}

function docsArticleTemplate() {
  return `---
import { getCollection, render } from "astro:content";
import BaseLayout from "zuedocs/layouts/BaseLayout.astro";
import DocsPageLayout from "zuedocs/layouts/DocsPageLayout.astro";
import { docCategories, primaryNav, siteConfig } from "../../data/docs";

const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);

export async function getStaticPaths() {
  const entries = await getCollection("docs");
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry }
  }));
}

const { entry } = Astro.props;
const { Content, headings } = await render(entry);

const grouped = docCategories
  .map((category) => ({
    category,
    entries: docs.filter((doc) => doc.data.category === category)
  }))
  .filter((group) => group.entries.length > 0);
---

<BaseLayout
  title={\`\${entry.data.title} | \${siteConfig.name} Docs\`}
  description={entry.data.description}
  siteConfig={siteConfig}
  primaryNav={primaryNav}
>
  <section class="shell docs-shell">
    <aside class="docs-sidebar">
      <p class="docs-sidebar__eyebrow">Docs map</p>
      {grouped.map((group) => (
        <div class="docs-sidebar__group">
          <p>{group.category}</p>
          <ul>
            {group.entries.map((doc) => (
              <li>
                <a
                  class:list={["docs-sidebar__link", doc.id === entry.id && "is-active"]}
                  href={\`/docs/\${doc.id}\`}
                >
                  {doc.data.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>

    <article class="docs-article">
      <DocsPageLayout
        title={entry.data.title}
        description={entry.data.description}
        category={entry.data.category}
      >
        <Content />
      </DocsPageLayout>
    </article>

    <aside class="docs-toc">
      <p class="docs-toc__eyebrow">On this page</p>
      <ul>
        {headings.map((heading) => (
          <li>
            <a href={\`#\${heading.slug}\`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </aside>
  </section>
</BaseLayout>

<script>
  import "zuedocs/docsEnhancements";
</script>
`;
}

const docsMarkdownIndexTemplate = `import { getCollection } from "astro:content";
import { docCategories, siteConfig } from "../data/docs";

export async function GET() {
  const entries = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);

  const lines = [
    \`# \${siteConfig.name} Docs\`,
    "",
    "This is the raw markdown index for the documentation routes.",
    ""
  ];

  for (const category of docCategories) {
    const groupedEntries = entries.filter((entry) => entry.data.category === category);
    if (groupedEntries.length === 0) {
      continue;
    }

    lines.push(\`## \${category}\`, "");

    for (const entry of groupedEntries) {
      lines.push(\`- [\${entry.data.title}](/docs/\${entry.id}.md): \${entry.data.description}\`);
    }

    lines.push("");
  }

  return new Response(lines.join("\\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8"
    }
  });
}
`;

const docsMarkdownRouteTemplate = `import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCollection } from "astro:content";

export async function getStaticPaths() {
  const entries = await getCollection("docs");

  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { filePath: entry.filePath }
  }));
}

export async function GET({ props }: { props: { filePath?: string } }) {
  if (!props.filePath) {
    return new Response("Markdown source not found.\\n", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  const source = await readFile(join(process.cwd(), props.filePath), "utf8");

  return new Response(source, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8"
    }
  });
}
`;

const quickstartDoc = `---
title: Quickstart
description: Install the dependencies, run the checks, and start replacing the scaffolded copy.
summary: The shortest path from scaffold to your own docs content.
order: 1
category: Start
---

# Quickstart

This site uses the shared \`zuedocs\` package for layout, styling, and docs UX enhancements.

## Local development

\`\`\`bash
bun install
bun run check
bun run dev
\`\`\`

## What to customize first

- Update \`src/data/docs.ts\` with your site name, description, repo URL, and nav.
- Replace the homepage copy in \`src/pages/index.astro\`.
- Replace the markdown files in \`src/content/docs\` with your own docs.
`;

const sharedSurfaceDoc = `---
title: Shared surface
description: Understand which pieces come from the package and which stay local to your repo.
summary: Keep content local, keep the docs shell centralized.
order: 2
category: Guides
---

# Shared surface

The scaffold intentionally keeps the shared presentation layer in the package:

- \`BaseLayout.astro\`
- \`DocsPageLayout.astro\`
- \`styles.css\`
- \`docsEnhancements\`

Your repo should primarily own:

- markdown docs content
- \`src/data/docs.ts\`
- homepage or product-specific copy
- Astro config and deployment wiring
`;

const operationsDoc = `---
title: Release flow
description: Publish \`zuedocs\`, let Renovate open dependency PRs, and keep each docs repo thin.
summary: The maintenance loop for shared docs changes.
order: 3
category: Operations
---

# Release flow

When the shared package changes:

1. Bump the \`zuedocs\` version.
2. Push a matching Git tag like \`v0.1.2\`.
3. Let the package release workflow publish to npm.
4. Let Renovate update downstream repos.
`;

async function scaffold(targetDir, projectName) {
  const repoName = projectName.toLowerCase().replace(/\s+/g, "-");

  await write(targetDir, ".gitignore", "node_modules\n.astro\ndist\n");
  await write(targetDir, "package.json", packageJsonTemplate(projectName));
  await write(
    targetDir,
    "tsconfig.json",
    JSON.stringify(
      {
        extends: "astro/tsconfigs/strict",
        include: [".astro/types.d.ts", "src/**/*", "astro.config.mjs"]
      },
      null,
      2
    ) + "\n"
  );
  await write(
    targetDir,
    "astro.config.mjs",
    `import { defineConfig } from "astro/config";
import zueDocs from "zuedocs/astro";

export default defineConfig({
  output: "static",
  integrations: [zueDocs()]
});
`
  );
  await write(targetDir, "src/content.config.ts", contentConfigTemplate());
  await write(targetDir, "src/data/docs.ts", dataDocsTemplate(projectName, repoName));
  await write(targetDir, "src/pages/index.astro", indexPageTemplate());
  await write(targetDir, "src/pages/docs/index.astro", docsIndexTemplate());
  await write(targetDir, "src/pages/docs/[...slug].astro", docsArticleTemplate());
  await write(targetDir, "src/pages/docs.md.ts", docsMarkdownIndexTemplate);
  await write(targetDir, "src/pages/docs/[...slug].md.ts", docsMarkdownRouteTemplate);
  await write(targetDir, "src/content/docs/quickstart.md", quickstartDoc);
  await write(targetDir, "src/content/docs/shared-surface.md", sharedSurfaceDoc);
  await write(targetDir, "src/content/docs/release-flow.md", operationsDoc);
  await write(
    targetDir,
    "public/favicon.svg",
    await readFile(path.join(packageRoot, "public", "favicon.svg"), "utf8")
  );
  await write(
    targetDir,
    "README.md",
    `# ${projectName}

Generated with \`bunx zuedocs init\`.

## Commands

\`\`\`bash
bun install
bun run check
bun run dev
\`\`\`
`
  );
}

async function main() {
  const invokedAs = path.basename(process.argv[1] ?? "zuedocs");
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  let targetArg = args[0];
  if (invokedAs === "zuedocs" || invokedAs === "zuedocs.js") {
    if (args[0] !== "init") {
      usage();
      process.exitCode = 1;
      return;
    }
    targetArg = args[1];
  }

  const targetName = targetArg ?? "zuedocs-site";
  const targetDir = path.resolve(process.cwd(), targetName);
  const projectName = titleCase(path.basename(targetDir));

  await ensureEmptyDir(targetDir);
  await scaffold(targetDir, projectName);

  console.log(`Created ${projectName} in ${targetDir}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${targetName}`);
  console.log("  bun install");
  console.log("  bun run check");
  console.log("  bun run dev");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
