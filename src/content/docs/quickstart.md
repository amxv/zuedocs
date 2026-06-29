---
title: Quickstart
description: Install dependencies, run the local Astro site, and make the first content changes without touching the layout code.
order: 1
category: Launch
summary: The shortest path from fresh clone to a local docs site you can edit confidently.
---

## What you cloned

ZueDocs is a static Astro documentation template. The repo ships with:

- a polished homepage at `/`
- a docs index at `/docs`
- markdown-backed article pages in `src/content/docs`
- a single global stylesheet controlling the visual system

That means your first task is usually not framework work. It is replacing template copy with your own product story.

## Local development

Install dependencies and start the dev server:

```bash
bun install
bun run dev
```

Astro will print a local URL, usually `http://localhost:4321`.

## First edits to make

Change these files first:

1. `src/data/docs.ts` for site-wide naming and nav links.
2. `src/pages/index.astro` for the landing page narrative.
3. `src/content/docs/*.md` for the actual documentation pages.

Only move into the layout and style files once the content shape is clear.

## Before you ship

Run the narrow validation commands for this template:

```bash
bun run check
bun run build
```

`check` catches Astro and TypeScript problems. `build` verifies the static output path.
