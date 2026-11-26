# ZueDocs

`zuedocs` is a reusable Astro docs shell for product docs sites.

It gives you a shared presentation layer for:

- landing pages
- docs index pages
- docs article pages with sidebar and table of contents
- shared styles
- client-side docs enhancements like copy buttons, page action menus, Mermaid rendering, responsive table wrappers, an "On this page" outline with reading progress, heading links, and Previous / Next links
- build-time features through the shared Astro integration: search, sitemap, callouts, social preview images, `llms.txt`, broken-link checking, a 404 page, and frontmatter redirects

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

- `zuedocs/astro`
- `zuedocs/layouts/BaseLayout.astro`
- `zuedocs/layouts/DocsPageLayout.astro`
- `zuedocs/components/SiteHeader.astro`
- `zuedocs/components/ThemeToggle.astro`
- `zuedocs/components/SiteFooter.astro`
- `zuedocs/components/DocsPageActions.astro`
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

Register the first-party integration once in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import zueDocs from "zuedocs/astro";

export default defineConfig({
  output: "static",
  integrations: [zueDocs()]
});
```

That integration owns shared build-time features such as production search indexing and sitemap generation. Individual docs repos do not install or configure those features separately.

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
  repoUrl: "https://github.com/my-org/my-product"
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

## Page action menu

Docs pages include a compact action menu at the top of the page. It can copy the current page from the raw Markdown endpoint, open that `.md` endpoint in a new tab, and open common AI chat tools with a prefilled prompt pointing at the page.

For example, `/docs/quickstart` resolves its raw source as `/docs/quickstart.md`, and `/docs` resolves as `/docs.md`.

## Theme toggle

`SiteHeader.astro` includes a small theme toggle after the primary navigation. It cycles between `system`, `light`, and `dark`, stores the selection in local storage, and applies the resolved theme before paint from `BaseLayout.astro` to avoid a light/dark flash. The toggle is enabled by default and can be disabled with `themeToggle: false` in `siteConfig`.

## Raw markdown routes

The docs routes also expose raw markdown endpoints.

Examples:

- `/docs.md`
- `/docs/quickstart.md`
- `/docs/deployment.md`

This is useful when another tool or agent wants the source markdown instead of rendered HTML.

## Sitemap generation

Production builds using `zueDocs()` generate `/sitemap.xml` from the HTML pages Astro actually emitted. The shared layout also advertises the sitemap with `rel="sitemap"`.

No sitemap-specific consumer configuration is needed on Vercel: ZueDocs uses Vercel's production project URL automatically. Cloudflare Pages deployment URLs are also detected. If a different deployment platform is used, an existing Astro `site` value is used instead.

Raw `.md` endpoints and error pages are not included in the sitemap.

## Build-time features

The `zuedocs()` integration adds these without per-site setup:

- **Callouts.** GitHub-style `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, and `[!CAUTION]` blockquotes render as callouts.
- **Social previews.** Every page gets a canonical URL, Open Graph and Twitter tags, and a generated 1200x630 image at `/og/<page>.png`. Set `siteConfig.ogImage` to a fixed image URL, or `false` to skip images.
- **`llms.txt`.** `/llms.txt` lists every docs page as a link to its raw Markdown route. `/llms-full.txt` holds the full text of every page.
- **Link checking.** The build fails when an internal link or `#anchor` points nowhere, listing each broken link.
- **404 page.** A shared 404 page with search is added unless the site has its own `src/pages/404.astro`.
- **Redirects.** A docs page can list old URLs under `redirectFrom` in its frontmatter.

Options, all optional:

```js
zuedocs({
  linkCheck: "error", // or "warn" / "off"
  llmsTxt: true,
  notFoundPage: true
});
```

Canonical URLs and preview images need the deployed URL, which comes from Astro's `site` option or the production Vercel or Cloudflare Pages URL.

## Release model

`zuedocs` is designed to be published and consumed as a versioned dependency.

Release flow, all in GitHub Actions on each non-bot push to `main`:

1. **Smoke build.** Every consumer site is built against the packed package. A site that fails only with the new package blocks the release. A site that already failed on its current version is reported but does not block. Put `[skip smoke]` in the commit message to skip this step.
2. **Publish.** The package is validated, bumped by one patch version, tagged like `v0.1.7`, and published to npm.
3. **Rollout.** Every consumer is upgraded to the new version. If its check and build pass, the bump is committed straight to its default branch, and that repository's own docs workflow deploys it. If not, the bump goes to a `zuedocs/upgrade-<version>` pull request with the failure log.

The job summary of each run has a table of what happened to every site.

## Upgrading consumer sites

`zuedocs-fleet` is a Go CLI in this repo (`cmd/zuedocs-fleet`) that the release workflow uses. It also works locally:

```bash
go install github.com/amxv/zuedocs/cmd/zuedocs-fleet@latest

zuedocs-fleet upgrade [dir]        # upgrade the sites in one checkout, then check and build (no commit)
zuedocs-fleet list                 # consumer repositories
zuedocs-fleet adopt                # list repositories that depend on zuedocs but are not tagged
zuedocs-fleet adopt <repo>         # tag a repository as a consumer
zuedocs-fleet smoke --tarball zuedocs-0.1.30.tgz   # build every consumer against a packed package
zuedocs-fleet rollout --version latest [--only repo,...] [--dry-run]
```

**Consumers are repositories with the `zuedocs` GitHub topic.** Tag a new docs repo with `zuedocs-fleet adopt <repo>` or `gh repo edit --add-topic zuedocs`. Leave forks and stale copies untagged so they never receive upgrades.

**Sites are found automatically.** Any `package.json` in the repository that depends on `zuedocs` is a site, whether it lives in `docs/`, `site/`, `apps/site/`, or the repository root. The package manager comes from the nearest lockfile, so workspace sites install from the workspace root. Bun wins when one directory has several lockfiles. Checks run `docs:check`, `check`, or `typecheck`, and builds run `docs:build` or `build`, whichever the site's `package.json` has first. Only `package.json` files and lockfiles are committed.

**Credentials.** Locally, the CLI uses `gh auth token`. In Actions, the `fleet` workflow needs a token that can push to and open pull requests on the consumer repositories. Use either:

- a fine-grained personal access token with access to all repositories and read and write permission for Contents and Pull requests, stored as the `ZUEDOCS_FLEET_TOKEN` secret, or
- a GitHub App installed on the account with the same permissions, with its ID in the `ZUEDOCS_FLEET_APP_ID` variable and its private key in the `ZUEDOCS_FLEET_APP_PRIVATE_KEY` secret.

Without either, the smoke and rollout jobs print a warning and the release still publishes.

The `fleet` workflow can also be run by hand from the Actions tab, to retry a rollout, to roll out to some repositories with `only`, or to run a dry run.
