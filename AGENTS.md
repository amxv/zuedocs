# ZueDocs Agent Notes

This repo is not just a docs site. It is the shared docs package and scaffold used by downstream repos.

Current known downstream consumers include:

- `webctx`
- `cf-cli`
- `zodex`
- `gooselake`

Treat changes here as package changes first and local site changes second.

## What ZueDocs Owns

This package is the shared source of truth for:

- `BaseLayout.astro`
- `DocsPageLayout.astro`
- `SiteHeader.astro`
- `SiteFooter.astro`
- shared styles
- `docsEnhancements`
- scaffold CLI in `bin/zuedocs.js`
- exported shared types in `src/types.ts`

Downstream repos should keep their own:

- markdown docs content
- `src/data/docs.ts`
- homepage and product copy
- repo-specific Astro and deployment config

If a requested change is part of the shared shell or behavior, prefer changing `zuedocs` rather than copy-pasting changes into each consumer.

## How To Think About Changes

Before editing package files, ask:

1. Is this a shared shell concern or a repo-specific content concern?
2. Will this change affect all downstream consumers?
3. Does the API need to become more configurable instead of hardcoding template assumptions?

Good example:

- adding `footerSections` support in `siteConfig` so downstream repos can keep shared layout structure while customizing footer content

Bad example:

- hardcoding product-specific footer or homepage assumptions into the package

## Existing Consumer Pattern

Downstream Astro docs repos should consume the package by:

- importing `zuedocs/layouts/BaseLayout.astro`
- importing `zuedocs/layouts/DocsPageLayout.astro`
- importing `zuedocs/docsEnhancements`
- passing local `siteConfig` and `primaryNav`

They should not keep duplicate local copies of the shared layout files unless there is a deliberate reason to fork the shell.

## `src/data/docs.ts` Contract In Consumers

When migrating or maintaining a downstream repo, the local `siteConfig` is the main configuration seam.

At a high level it can carry:

- `name`
- `strapline`
- `description`
- `repoUrl`
- optional `footerSections`

If `footerSections` is omitted, the shared footer falls back to generic template copy. For real product docs sites, agents should usually define repo-specific `footerSections`.

## Scaffold vs Migration

Use the correct path.

### For a brand new docs app

Use the scaffold CLI:

```bash
bunx zuedocs init my-docs
```

Alias form:

```bash
bunx --package zuedocs create-zuedocs my-docs
```

Do not recommend plain `bunx create-zuedocs my-docs`.

`zuedocs init` requires an empty target directory. It is not an in-place conversion tool.

### For an existing non-Astro repo

Scaffold a subdirectory such as:

```bash
bunx zuedocs init docs-site
```

Recommended for Go/Rust/CLI/API repos that need a dedicated docs site.

### For an existing Astro docs site

Do not scaffold over it. Migrate it to the package:

1. add `zuedocs` as a dependency
2. switch layouts/scripts to package imports
3. move local branding/footer config into `src/data/docs.ts`
4. remove obsolete local shared-shell files
5. validate serially with `check` then `build`

## Validation Expectations

When changing the package, validate more than the local site if the change affects exported behavior.

Minimum local validation:

```bash
bun run check
bun run build
npm pack --dry-run
```

If you changed exported layouts, components, scripts, types, or scaffold behavior, also validate relevant downstream consumers.

At least one real consumer should be checked when the change affects shared runtime behavior. If the change is obviously broad, check all impacted consumers.

## Important Runtime Notes

### Astro race condition

Do not run `astro check` and `astro build` concurrently in the same repo. Astro can hit a `.astro` content-store race.

Prefer:

```bash
bun run check
bun run build
```

### Bun registry cache lag

If npm shows a newly published `zuedocs` version but `bun install` cannot resolve it, clear Bun's cache and reinstall:

```bash
bun pm cache rm
bun install --force --no-cache
```

## Release Model

This package is published to npm through tag-based GitHub Actions.

Current flow:

1. change `zuedocs`
2. bump version in `package.json`
3. push commit
4. push tag like `v0.1.7`
5. `release.yml` publishes to npm

After publishing, downstream repos may need:

- Renovate to open PRs on its schedule
- or a manual version bump if an immediate update is required

Do not assume downstream repos are automatically updated the moment npm publish succeeds.

## Deployment Notes For Consumers

Some downstream repos are linked to Vercel, but production aliases may still require a fresh deploy even after a push.

If a consumer repo has the right package version and code but the live site still looks stale:

1. check the deployed HTML
2. inspect the latest Vercel production deployment
3. if needed, trigger `vercel --prod --yes`

Do not assume Git integration alone means the live alias is already updated.

## AgentBox Reference

There is an AgentBox thread with reusable guidance for future agents:

- `thr_74b6bc21-37f8-4cf8-b0c7-75756d037eb7`
- title: `How to add a new docs site with zuedocs`

That thread includes:

- new-site scaffolding guidance
- existing Astro site migration guidance
- footer config notes
- Bun cache workaround
- serial Astro validation guidance

Read it if you need more context before changing the package or teaching another agent how to use it.
