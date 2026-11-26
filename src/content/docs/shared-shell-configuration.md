---
title: Shared shell configuration
description: Configure product identity, accessible accent colors, navigation, logos, and shared documentation behavior without forking ZueDocs components.
order: 4
category: Structure
summary: The supported configuration seam for branding a consumer while retaining the shared ZueDocs theme.
---

## Configure the site in one place

Each consumer keeps its product configuration in `src/data/docs.ts`. The shared layouts receive `siteConfig` and `primaryNav`; product pages should not reach into shared components to replace brand copy or navigation.

A complete configuration can look like this:

```ts
export const siteConfig = {
  name: "Example CLI",
  strapline: "Agent-friendly context from the terminal",
  description: "Documentation for the Example CLI.",
  repoUrl: "https://github.com/example/example-cli",
  logoHref: "/logo.svg",
  faviconHref: "/favicon.svg",
  accentColor: "#0369a1",
  accentColorDark: "#38bdf8"
} as const;

export const primaryNav = [
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true }
];
```

Only `name`, `strapline`, `description`, and `repoUrl` are required. The other fields are optional.

## Choose accessible accent colors

ZueDocs uses one shared signal color for active navigation, category labels, Docs Map state, selected borders, blockquotes, and small interaction details. Configure separate light and dark values:

```ts
accentColor: "#0369a1",
accentColorDark: "#38bdf8"
```

`accentColor` is used in the light theme. `accentColorDark` is used in the dark theme. If only `accentColor` is provided, ZueDocs reuses it in both themes. Define both whenever possible so small text and controls retain sufficient contrast against their backgrounds.

If neither value is provided, the shared shell uses its accessible ZueDocs orange defaults.

Do not override individual header, footer, or documentation selectors just to change their orange treatment. The package routes every shared accent through this configuration seam.

## Add a logo only when one exists

Visible brand imagery is opt-in:

- `logoHref` provides the image shown beside the product name in the shared header and footer.
- `faviconHref` provides the browser favicon and acts as the visible brand image when no separate logo is configured.
- If neither is configured, the shell renders a clean Space Grotesk wordmark without inventing a fallback logo.

The package always keeps the adjacent product name available, so decorative logo images use an empty alt value and do not duplicate the accessible name.

## Keep typography roles stable

The shared shell loads two type families:

- Space Grotesk for semantic headings and wordmark-style titles.
- Inter for body copy, navigation, controls, descriptions, and supporting interface text.

Monospace text remains reserved for code, commands, indexes, and compact technical metadata. Consumer sites should not replace body typography merely to make their homepage look different; product-specific composition belongs in the local homepage stylesheet.

## Keep code highlighting inside the shared theme

The ZueDocs Astro integration configures Shiki's CSS-variable theme. Shared styles then provide a high-contrast neutral code surface and semantic token colors for both light and dark modes. Keywords use the configured repository accent, while strings, constants, functions, comments, and punctuation keep stable complementary colors.

Consumers do not need to select a separate Shiki theme or override generated token styles. Choose accessible `accentColor` and `accentColorDark` values, keep the `zuedocs()` Astro integration enabled, and let the package coordinate code blocks with the rest of the shell.

## Footer

The shared footer shows the logo, product name, `strapline`, a repository link built from `repoUrl`, and the `powered by zuedocs` attribution. It has no per-site sections, so there is nothing to configure beyond those fields.

## Use the project title as the landing-page link

The shared wordmark already links to `/`, so do not add a separate `Overview` item that points to the same landing page. Keep `primaryNav` focused on destinations beyond the homepage, such as Docs and the repository.

For compatibility with existing consumers, the shared header filters non-external navigation items whose resolved pathname is `/`. When migrating a child repository, remove the redundant root item from its local `src/data/docs.ts` as well instead of relying permanently on that fallback.

## Let the repository link become the GitHub action

When a primary navigation item points to `siteConfig.repoUrl`, the shared header renders it as an accessible GitHub icon action. Other external links remain text links with an external-link indicator.

Keep the accessible label in the navigation data even though the visible repository action is icon-only:

```ts
{ href: siteConfig.repoUrl, label: "GitHub", external: true }
```

## Preserve shared documentation behavior

The package supplies:

- responsive sticky header and footer
- light, dark, and system theme modes
- documentation search in production
- automatic production sitemap generation
- the grouped docs index
- desktop Docs Map and table of contents
- mobile Docs Map drawer
- Copy Page, raw Markdown, and agent actions
- code-copy, tables, Mermaid diagrams, and fullscreen diagrams
- raw Markdown routes when the consumer keeps the generated route handlers
- an "On this page" outline that highlights the current section and shows reading progress
- link icons beside headings that copy a direct link to the section
- Previous and Next links at the end of each page, in Docs Map order
- callouts from GitHub-style `> [!NOTE]` blockquotes
- a shared 404 page with search, unless the site has its own `src/pages/404.astro`
- canonical URLs, Open Graph and Twitter tags, and a generated social preview image for every page
- `/llms.txt`, an index of the raw Markdown pages for coding agents, and `/llms-full.txt` with their full text
- a build-time check that fails on broken internal links and anchors
- `redirectFrom` frontmatter for renamed pages

Consumers supply their own docs collection, categories, page descriptions, headings, and Markdown content. Updating the package should improve the shared behavior without requiring those documents to move.

The `zuedocs()` Astro integration generates `/sitemap.xml` from the public HTML pages emitted by each consumer. Vercel's production project domain is detected automatically, so normal ZueDocs deployments do not need a site-specific sitemap package or config block. An explicit Astro `site` value remains the override for other deployment setups. Raw Markdown endpoints and error pages stay out of the sitemap.

## Social previews

Canonical URLs and social preview images need the deployed site URL. It comes from Astro's `site` option, or from the production Vercel or Cloudflare Pages URL when `site` is unset.

By default the build renders a 1200 by 630 preview image for every page at `/og/<page>.png`, using the page title, description, category, logo, and dark accent color. To use one fixed image instead, set `ogImage` to a root-relative or absolute URL. Set `ogImage: false` to omit preview images entirely.

```ts
export const siteConfig = {
  // ...
  ogImage: "/social-card.png"
} as const;
```

## Integration options

The `zuedocs()` integration works without options. Each build-time feature can be adjusted:

```js
import zuedocs from "zuedocs/astro";

export default defineConfig({
  integrations: [
    zuedocs({
      linkCheck: "warn", // "error" (default), "warn", or "off"
      llmsTxt: true, // write /llms.txt and /llms-full.txt
      notFoundPage: true // add the shared 404 page
    })
  ]
});
```

Use `linkCheck: "warn"` only as a temporary step while fixing existing broken links.

## Roll out a shared-shell release

ZueDocs consumers normally pin an exact package version. After a new version is published:

1. Update the `zuedocs` version in `package.json`.
2. Run `bun install` to update `bun.lock`.
3. Run `bun run check` followed by `bun run build`.
4. Review `/`, `/docs`, one article, both themes, and the mobile Docs Map.
5. Push the consumer update and confirm its production deployment.

The package update should not require copied layouts, rewritten docs pages, or a local header/footer implementation. If a consumer needs a different accent, logo, copy, or navigation, change `siteConfig` rather than the shared component structure.
