---
title: Content model
description: Understand how the docs collection is organized and where the template expects homepage, navigation, and long-form content to live.
order: 2
category: Structure
summary: A map of the files that matter when you adapt the template to a real product.
---

## Core files

The repo is intentionally compact. Most customization happens in a handful of places:

- `src/data/docs.ts` stores the site name, description, repo URL, nav links, and category list.
- `src/pages/index.astro` defines the landing page sections and messaging.
- `src/pages/docs/index.astro` renders the grouped docs index.
- `src/pages/docs/[...slug].astro` renders each markdown guide with navigation and a generated table of contents.
- `src/styles/global.css` controls the entire visual system.

## Markdown collection

Docs articles live in `src/content/docs`. Each file needs frontmatter with:

- `title`
- `description`
- `order`
- `category`
- optional `summary`

The category list is validated in `src/content.config.ts`, so keep that file aligned if you change the taxonomy.

## Content strategy

The template is strongest when the homepage does one job and the docs do another:

- Homepage: explain the product, who it is for, and where to start.
- Docs: answer practical questions in a reading order that reduces friction.

If the homepage starts reading like release notes, you are making the docs pages work too hard.
