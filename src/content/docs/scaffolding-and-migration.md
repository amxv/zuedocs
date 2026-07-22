---
title: Scaffolding and migration
description: Choose the correct ZueDocs setup path for a new documentation app, an existing non-Astro repository, or an established Astro docs site.
order: 2
category: Launch
summary: Agent-ready setup paths that preserve the shared shell instead of creating local layout forks.
---

## Start from the repository type

ZueDocs is both a published shared package and a scaffold. Choose the setup path from the state of the target repository rather than treating every project like a blank app.

| Starting point | Correct path |
| --- | --- |
| Brand-new docs app | Run the scaffold into an empty target directory. |
| Existing Go, Rust, CLI, or API repository | Scaffold a dedicated subdirectory such as `docs-site`. |
| Existing Astro docs site | Migrate its shared shell to the package without scaffolding over it. |

The end state is the same: product content and configuration stay in the product repository, while layouts, components, styles, and documentation behavior come from `zuedocs`.

## Scaffold a new docs app

Use the main CLI form:

```bash
bunx zuedocs init my-docs
```

The supported alias form is:

```bash
bunx --package zuedocs create-zuedocs my-docs
```

Do not use plain `bunx create-zuedocs my-docs`. The package publishes the alias from `zuedocs`, and the explicit `--package` form ensures Bun resolves the correct package.

The target directory must be empty. `zuedocs init` is a scaffold command, not an in-place conversion tool.

## Add docs to a non-Astro repository

Keep the documentation app isolated from the product build:

```bash
bunx zuedocs init docs-site
```

This pattern works well for terminal applications and APIs. The parent repository continues to own its language-specific build, while `docs-site` owns the Astro deployment and depends on the shared ZueDocs package.

After scaffolding, replace the starter content in this order:

1. Update `src/data/docs.ts` with product naming, repository URL, navigation, accents, and footer copy.
2. Replace the local homepage copy and composition in `src/pages/index.astro`.
3. Replace the Markdown guides in `src/content/docs`.
4. Adjust the category list in `src/data/docs.ts` and `src/content.config.ts` together.

## Migrate an existing Astro docs site

Do not scaffold over an existing Astro application. Migrate it to the package:

1. Add `zuedocs` as an exact dependency.
2. Import `zuedocs/layouts/BaseLayout.astro` from each site page.
3. Import `zuedocs/layouts/DocsPageLayout.astro` from article routes.
4. Import `zuedocs/components/DocsPageActions.astro` where the docs index exposes page actions.
5. Import `zuedocs/docsEnhancements` once on docs routes.
6. Move local naming, accents, repository links, and footer copy into `src/data/docs.ts`.
7. Remove obsolete local copies of shared layouts, header, footer, theme controls, and documentation styles.

Keep the product's Markdown, homepage, content schema, navigation, and deployment configuration local.

## Preserve the package boundary

Future agents should not copy shared shell files into every consumer to make a visual change. Change ZueDocs when the request affects:

- the header or footer
- heading typography
- documentation index or article layout
- Docs Map or table of contents
- search or theme controls
- Copy Page and raw Markdown actions
- code blocks, tables, diagrams, or shared reading styles

Change the consumer repository when the request affects:

- product documentation
- homepage narrative
- navigation labels
- category taxonomy
- product accent colors
- product logo or favicon
- repository-specific deployment settings

## Validate the result serially

Run Astro validation in order:

```bash
bun run check
bun run build
```

Do not run `astro check` and `astro build` concurrently in the same repository. Astro can race while writing its content store.

When a newly published ZueDocs version appears on npm but Bun cannot resolve it, clear the registry cache and reinstall:

```bash
bun pm cache rm
bun install --force --no-cache
```

After a package update, remove any redundant `Overview` navigation item that points to `/`; the clickable project title is the landing-page link. Then verify the landing page, `/docs`, one long article, theme switching, the mobile Docs Map, search, page actions, and the production deployment.
