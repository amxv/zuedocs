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

## Keep the page hierarchy shallow

The right sidebar is built from headings. Too many nested sections create noise. In practice:

- prefer `##` for major sections
- use `###` only when a section genuinely needs sub-steps
- avoid deep heading stacks that turn the table of contents into clutter

## Replace template voice early

The default copy is intentionally neutral. Once the real product direction is known, replace generic phrasing quickly so the repo stops sounding like starter content.
