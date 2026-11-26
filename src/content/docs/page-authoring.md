---
title: Page authoring
description: Use the starter writing patterns to keep docs pages readable, navigable, and consistent as the collection grows.
order: 5
category: Structure
summary: Lightweight editorial rules for turning markdown pages into a coherent docs experience.
---

## Write for scanability

The article layout assumes readers scan before they commit. Help them by using:

- a clear first heading
- short sections with specific nouns
- lists for sequences, requirements, and tradeoffs
- code blocks only when they remove ambiguity

## Frontmatter matters

`description` appears in the docs index and at the top of the page. Write it like a promise, not a repeat of the title.

Good:

> Wire a production domain on top of a Vercel deployment without improvising DNS changes.

Weak:

> Learn about deployment.

## Call out notes and warnings

Use GitHub's alert syntax for asides that readers must not miss. The same source renders as a callout on GitHub and on the docs site, and the raw Markdown routes keep it unchanged for agents.

```md
> [!NOTE]
> Sync only sends files Git tracks.

> [!WARNING]
> This deletes the sandbox and its disk.
```

> [!TIP]
> The supported types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`. A blockquote without a marker stays a normal quote.

Keep callouts rare. One per section is plenty; when everything is highlighted, nothing is.

## Keep old links working when you rename a page

A page's URL comes from its file name. When you rename or move a page, list the old URLs in its frontmatter so existing links and bookmarks redirect to the new location:

```md
---
title: Installation
redirectFrom:
  - /docs/setup
  - /docs/getting-started
---
```

Astro's own `redirects` option in `astro.config` also works for anything that is not a docs page.

## Links are checked on every build

The build fails when an internal link or `#anchor` points at a page or heading that does not exist, and lists each broken link with the page it is on. Fix the link, or add a `redirectFrom` entry if the target moved. External links are not checked.

## Keep the page hierarchy shallow

The right sidebar is built from headings. Too many nested sections create noise. In practice:

- prefer `##` for major sections
- use `###` only when a section genuinely needs sub-steps
- avoid deep heading stacks that turn the table of contents into clutter

## Replace template voice early

The default copy is intentionally neutral. Once the real product direction is known, replace generic phrasing quickly so the repo stops sounding like starter content.
