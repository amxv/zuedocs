---
title: Deployment workflow
description: Deploy the static Astro site to Vercel and attach a production domain managed in Cloudflare DNS.
order: 6
category: Operations
summary: A practical deployment path that matches the Vercel and Cloudflare workflow patterns already used around Gooselake.
---

## Vercel baseline

This template builds to static output, so Vercel deployment is straightforward:

1. Import the GitHub repo into Vercel.
2. Keep the default Astro build command or set it explicitly to `bun run build`.
3. Set the output directory to `dist` if Vercel does not infer it automatically.

Preview deployments should work on every push once dependencies install cleanly.

## CLI path

If you prefer the CLI workflow:

```bash
vercel
vercel --prod
```

Use the first run to link the project and the production run once the branch is ready.

## Cloudflare DNS pattern

When the domain is managed in Cloudflare, use the `cf` CLI on this machine instead of editing records manually.

Common patterns:

```bash
cf doctor
cf cname docs cname.vercel-dns.com --proxied=false
cf txt _vercel "verification-token"
```

Prefer `--proxied=false` for Vercel verification and DNS ownership records unless there is a deliberate reason to proxy traffic.

## Post-deploy checks

After the Vercel project and DNS are wired:

1. Confirm the apex or subdomain resolves correctly.
2. Check that `/` and `/docs` both load without asset errors.
3. Open one deep docs route directly to verify static routing.
4. Re-run `bun run build` locally if the deploy behaves differently than expected.
