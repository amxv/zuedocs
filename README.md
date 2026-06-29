# ZueDocs

`zuedocs` is a reusable Astro docs shell for product docs sites.

It gives you a shared presentation layer for:

- landing pages
- docs index pages
- docs article pages with sidebar and table of contents
- shared styles
- client-side docs enhancements like copy buttons, Mermaid rendering, and responsive table wrappers

The intended model is:

1. keep shared docs UI in `zuedocs`
2. publish it to npm
3. let downstream docs repos consume it as a dependency
4. keep repo-specific content and branding local

## What stays local in each docs repo

Each consuming repo should keep these pieces in its own codebase:

- markdown docs content
- `src/data/docs.ts`
- homepage and product copy
- repo-specific Astro and deployment config

`src/data/docs.ts` is the seam between the shared shell and the local site. At a high level it defines:

- `siteConfig`
- `primaryNav`
- `docCategories`

## Package surface

`zuedocs` currently exports:

- `zuedocs/layouts/BaseLayout.astro`
- `zuedocs/layouts/DocsPageLayout.astro`
- `zuedocs/components/SiteHeader.astro`
- `zuedocs/components/SiteFooter.astro`
- `zuedocs/docsEnhancements`
- `zuedocs/styles.css`
- `zuedocs/types`

The exported types currently include:

- `SiteConfig`
- `PrimaryNavItem`
- `FooterSection`

`SiteConfig` supports:

- `name`
- `strapline`
- `description`
- `repoUrl`
- optional `footerSections`

## Scaffold a new docs site

Use the scaffold CLI when you want a brand new docs app with the shared shell already wired in.

Preferred command:

```bash
bunx zuedocs init my-docs
```

Alias form:

```bash
bunx --package zuedocs create-zuedocs my-docs
```

Do not use plain `bunx create-zuedocs my-docs`. `create-zuedocs` is a bin inside the `zuedocs` package, not a standalone npm package.

### Important behavior

`zuedocs init` requires an empty target directory. It is a scaffold command, not an in-place migration tool.

That means:

- good: `bunx zuedocs init docs-site`
- bad: running it at the root of an existing non-empty repo

### Existing project pattern

If you already have an application repo, create a docs subdirectory instead of trying to scaffold over the root.

Example:

```text
my-project/
  app/
  internal/
  package.json or go.mod
  docs-site/
```

Recommended flow:

```bash
bunx zuedocs init docs-site
cd docs-site
bun install
bun run check
bun run build
```

Then customize:

- `src/data/docs.ts`
- `src/pages/index.astro`
- `src/content/docs/*.md`

## Use it inside an existing Astro docs site

If you already have an Astro docs site and only want the shared shell, install the package and wire it in manually.

Install:

```bash
bun add -d zuedocs
```

Example:

```astro
---
import BaseLayout from "zuedocs/layouts/BaseLayout.astro";
import DocsPageLayout from "zuedocs/layouts/DocsPageLayout.astro";
import { primaryNav, siteConfig } from "../data/docs";
---

<BaseLayout
  title={`${siteConfig.name} | ${siteConfig.strapline}`}
  description={siteConfig.description}
  siteConfig={siteConfig}
  primaryNav={primaryNav}
>
  <DocsPageLayout
    title="Guide title"
    description="Guide summary"
    category="Start"
  >
    <p>Your docs content.</p>
  </DocsPageLayout>
</BaseLayout>

<script>
  import "zuedocs/docsEnhancements";
</script>
```

## Example `docs.ts`

```ts
export const siteConfig = {
  name: "My Product",
  strapline: "Documentation",
  description: "Docs for My Product.",
  repoUrl: "https://github.com/my-org/my-product",
  footerSections: [
    {
      title: "My Product",
      text: "Short footer description for the docs site."
    },
    {
      title: "Repository",
      linkPrefix: "Source: ",
      linkHref: "https://github.com/my-org/my-product",
      linkLabel: "github.com/my-org/my-product"
    }
  ]
} as const;

export const docCategories = ["Start", "Guides", "Operations"] as const;

export const primaryNav = [
  { href: "/", label: "Overview" },
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true }
];
```

## Local development

For this repo:

```bash
bun install
bun run dev
```

Validation:

```bash
bun run check
bun run build
```

## Raw markdown routes

The docs routes also expose raw markdown endpoints.

Examples:

- `/docs.md`
- `/docs/quickstart.md`
- `/docs/deployment.md`

This is useful when another tool or agent wants the source markdown instead of rendered HTML.

## Release model

`zuedocs` is designed to be published and consumed as a versioned dependency.

Release flow:

1. change `zuedocs`
2. bump the version
3. push a tag like `v0.1.7`
4. GitHub Actions publishes the package to npm
5. downstream repos update via Renovate or manual dependency bumps

This keeps shared docs UI centralized instead of copied across repos.
