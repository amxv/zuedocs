---
title: Release checklist
description: Use a short pre-merge checklist so the docs site stays tidy as the template evolves into a real product property.
order: 7
category: Operations
summary: A durable checklist for content, styling, and deployment validation before you cut a release.
---

## Content checks

- Replace placeholder company names, claims, and links.
- Confirm every docs page has a useful `description` and consistent category.
- Make sure the homepage CTA targets a real guide, not starter content you deleted.

## Presentation checks

- Verify the site on both desktop and mobile widths.
- Read one long docs page to confirm heading rhythm, spacing, and code block styling still feel intentional.
- Check that navigation labels still fit cleanly inside the header capsule.

## Shipping checks

Run the local validations:

```bash
bun run check
bun run build
```

If the repo is using GitHub pull requests, keep the CI workflow passing before merging to `main`.

## Domain checks

If you are changing the production host:

- verify the Vercel target domain
- verify the Cloudflare record values
- verify HTTPS is active after propagation
