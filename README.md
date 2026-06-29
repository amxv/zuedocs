# ZueDocs

ZueDocs is a reusable Astro docs-site template based on the overall design language of the current Gooselake site, but generalized into a clean starter for any product or internal documentation property.

It ships with:

- a polished landing page
- a grouped docs index
- markdown-powered docs pages with a sticky navigation and generated table of contents
- starter guidance for Vercel deployment and Cloudflare DNS wiring
- a lightweight GitHub Actions CI check

## Stack

- Astro 7
- TypeScript
- Bun for package management and scripts
- Static output suitable for Vercel

## Local development

```bash
bun install
bun run dev
```

Open the local Astro URL and start by editing:

- `src/data/docs.ts`
- `src/pages/index.astro`
- `src/content/docs/*.md`

## Checks

```bash
bun run check
bun run build
```

## Raw markdown routes

Every docs page also has a raw markdown URL by appending `.md` to the route.

Examples:

- `/docs.md` returns a plain markdown index of the docs collection
- `/docs/quickstart.md` returns the raw source for that guide
- `/docs/deployment.md` returns the raw source for that guide

This is useful when you want to fetch the original markdown directly instead of the rendered HTML page.

## Repo structure

```text
src/
  components/        Header and footer
  content/docs/      Markdown guides
  data/              Site config and category definitions
  layouts/           Base and docs article layouts
  pages/             Landing page and docs routes
  styles/            Global design system
.github/workflows/   CI validation
public/              Static assets
```

## Deploying to Vercel

1. Import the repo into Vercel or run `vercel` locally to link it.
2. Keep `bun run build` as the build command if Vercel does not infer it.
3. Ensure the output directory is `dist`.
4. Use `vercel --prod` once the `main` branch is ready.

## Cloudflare DNS workflow

This machine already has a `cf` CLI workflow for Cloudflare DNS. Prefer that over editing records manually.

Common commands:

```bash
cf doctor
cf cname docs cname.vercel-dns.com --proxied=false
cf txt _vercel "verification-token"
```

Use `--proxied=false` for Vercel verification or ownership records unless you explicitly want proxying.

## Customizing the template

- Replace the content files with your actual docs and update the category enum if the taxonomy changes.
- Update `siteConfig` in `src/data/docs.ts` with your product name, description, and repository URL.
- Adjust the visual system in `src/styles/global.css` if you need a different tone while keeping the layout primitives.
- Add more guides to `src/content/docs` and control order with the `order` frontmatter field.

## Scaffolding a new docs site

Generate a thin Astro docs site with the shared package already wired in:

```bash
bunx zuedocs init my-docs
```

or:

```bash
bunx --package zuedocs create-zuedocs my-docs
```

The scaffold keeps the repo-specific surface local:

- markdown docs content
- `src/data/docs.ts`
- homepage and product copy
- Astro and deployment config

It imports the shared docs shell from `zuedocs`.

## Using ZueDocs as a shared package

ZueDocs can also be consumed by other Astro docs sites so improvements to shared docs UI flow through dependency updates instead of copy-pasting files across repositories.

Install the shared package:

```bash
bun add -d zuedocs
```

Import the shared layouts and docs enhancement runtime:

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
  <DocsPageLayout title="Guide title" description="Guide summary" category="Start">
    <p>Your docs content.</p>
  </DocsPageLayout>
</BaseLayout>

<script>
  import "zuedocs/docsEnhancements";
</script>
```

The package currently exports:

- `zuedocs/styles.css` for the shared visual system
- `zuedocs/docsEnhancements` for copy buttons, Mermaid rendering/fullscreen controls, and responsive Markdown table wrappers
- `zuedocs/layouts/BaseLayout.astro`
- `zuedocs/layouts/DocsPageLayout.astro`
- `zuedocs/components/SiteHeader.astro`
- `zuedocs/components/SiteFooter.astro`
- `zuedocs/types` for `SiteConfig` and `PrimaryNavItem`

For local consumers before the npm package is published, use a GitHub dependency pinned to a commit SHA. After publishing, switch downstream docs sites to the npm version range.
