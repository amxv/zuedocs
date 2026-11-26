# ZueDocs Agent Notes

This repo is not just a docs site. It is the shared docs package and scaffold used by downstream repos.

Downstream consumers are the repositories with the `zuedocs` GitHub topic. List them with `zuedocs-fleet list` (see "Upgrading Consumers" below). There are about 30, public and private, including `webctx`, `cf-cli`, `zodex`, `gooselake`, and `boatparty`.

Treat changes here as package changes first and local site changes second.

## What ZueDocs Owns

This package is the shared source of truth for:

- `BaseLayout.astro`
- `DocsPageLayout.astro`
- `SiteHeader.astro`
- `SiteFooter.astro`
- shared styles
- `docsEnhancements` (plus `docsNavigation`: outline progress, heading links, Previous / Next)
- the `zuedocs()` Astro integration in `src/integrations/`: search, sitemap, callouts, social preview images, `llms.txt`, link checking, the injected 404 page, and frontmatter redirects
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

- adding an optional `siteConfig` field so downstream repos can customize shared shell content without forking layouts

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

The shared footer is built from `name`, `strapline`, `logoHref` and `repoUrl`. `footerSections` is deprecated and ignored; it stays in the type only so older configs still type-check.

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
3. move local branding config into `src/data/docs.ts`
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

This package is published to npm automatically from GitHub Actions on pushes to `main`.

Current flow in `release.yml`:

1. `smoke` (the `fleet.yml` workflow) builds every consumer against the packed package and blocks the release on a regression. `[skip smoke]` in the commit message skips it.
2. `publish` validates the package (including `go vet` and `go test`), bumps `package.json` by one patch version, commits and tags it like `v0.1.7`, and publishes to npm.
3. `rollout` (`fleet.yml` again) upgrades every consumer: a passing site gets a commit on its default branch, which its own docs workflow deploys, and a failing one gets a `zuedocs/upgrade-<version>` pull request with the log.

Smoke and rollout need the `ZUEDOCS_FLEET_TOKEN` secret (or the `ZUEDOCS_FLEET_APP_ID` variable plus `ZUEDOCS_FLEET_APP_PRIVATE_KEY` secret). Without it they only warn, and consumers must be upgraded by hand.

## Upgrading Consumers

Use the Go CLI in `cmd/zuedocs-fleet` (logic in `internal/fleet`) instead of bumping repos one by one:

```bash
go run ./cmd/zuedocs-fleet rollout --version latest --dry-run   # all consumers, push nothing
go run ./cmd/zuedocs-fleet rollout --version latest --only angelos
go run ./cmd/zuedocs-fleet upgrade ../some-repo                  # one local checkout, no commit
```

When you scaffold or migrate a docs site in another repo, tag that repo with `go run ./cmd/zuedocs-fleet adopt <repo>` so future releases reach it. `adopt` with no arguments lists dependents that are not tagged yet. Leave forks and stale copies (such as `boatparty-private`) untagged.

A site that cannot pass the rollout's install, check, and build will get a pull request on every release until it is fixed. Prefer fixing the consumer (or making the package more configurable) over special cases in the CLI.

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
