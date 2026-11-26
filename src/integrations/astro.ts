import { existsSync } from "node:fs";
import type { AstroIntegration } from "astro";

import { rehypeDocsCallouts, satteriCalloutsPlugin } from "./callouts.ts";
import { checkLinks, type LinkCheckMode } from "./linkCheck.ts";
import { writeLlmsFiles } from "./llms.ts";
import { writeOgImages } from "./ogImages.ts";
import { indexPagefindSite } from "./pagefind.ts";
import { collectDocsRedirects } from "./redirects.ts";
import {
  resolveSitemapSite,
  warnMissingSitemapSite,
  writeSitemap,
  type ResolvedSitemapSite
} from "./sitemap.ts";

export interface ZuedocsOptions {
  /**
   * Checks every internal link and `#anchor` in the built site.
   * "error" (default) fails the build, "warn" only reports, "off" skips it.
   */
  linkCheck?: LinkCheckMode;
  /** Write /llms.txt and /llms-full.txt from the docs Markdown index. Defaults to true. */
  llmsTxt?: boolean;
  /** Add the shared 404 page when the site has no src/pages/404 of its own. Defaults to true. */
  notFoundPage?: boolean;
}

interface MarkdownProcessorLike {
  name: string;
  options?: object;
}

// Astro 7 runs Markdown through a processor object. Its options are read when
// the renderer is created, so integrations extend them in place.
function addCalloutPlugin(processor: MarkdownProcessorLike | undefined, logger: { warn(message: string): void }) {
  const options = processor?.options as Record<string, unknown> | undefined;
  const listKey = processor?.name === "satteri" ? "hastPlugins" : processor?.name === "unified" ? "rehypePlugins" : undefined;
  if (!options || !listKey) {
    logger.warn(`[zuedocs] Callouts are disabled: unsupported Markdown processor "${processor?.name ?? "none"}".`);
    return;
  }

  const plugin = listKey === "hastPlugins" ? satteriCalloutsPlugin : rehypeDocsCallouts;
  const list = Array.isArray(options[listKey]) ? (options[listKey] as unknown[]) : [];
  if (!list.includes(plugin)) list.push(plugin);
  options[listKey] = list;
}

const NOT_FOUND_PAGES = ["404.astro", "404.md", "404.mdx", "404.html"];

export default function zuedocs(options: ZuedocsOptions = {}): AstroIntegration {
  const {
    linkCheck = "error",
    llmsTxt = true,
    notFoundPage = true
  } = options;

  let sitemapSite: ResolvedSitemapSite | undefined;
  let base = "/";
  let redirectSources = new Set<string>();

  return {
    name: "amxv:zuedocs",
    hooks: {
      "astro:config:setup": async ({ config, updateConfig, injectRoute, logger }) => {
        const redirects = await collectDocsRedirects({ root: config.root });
        const redirectCount = Object.keys(redirects).length;
        if (redirectCount > 0) {
          logger.info(`[zuedocs] Added ${redirectCount} redirect${redirectCount === 1 ? "" : "s"} from docs frontmatter`);
        }

        // Canonical URLs and social images need an absolute site URL. Fall back
        // to the production Vercel or Cloudflare Pages URL when none is set.
        const detectedSite = config.site ? undefined : resolveSitemapSite({ astroSite: undefined });

        updateConfig({
          ...(detectedSite ? { site: detectedSite.url.toString() } : {}),
          redirects,
          markdown: {
            shikiConfig: {
              theme: "css-variables"
            }
          }
        });
        addCalloutPlugin(config.markdown.processor, logger);

        const hasOwnNotFound = NOT_FOUND_PAGES.some((file) => existsSync(new URL(`./src/pages/${file}`, config.root)));
        if (notFoundPage && !hasOwnNotFound) {
          injectRoute({
            pattern: "/404",
            entrypoint: new URL("../routes/404.astro", import.meta.url),
            prerender: true
          });
        }
      },
      "astro:config:done": ({ config }) => {
        sitemapSite = resolveSitemapSite({ astroSite: config.site });
        base = config.base;
        redirectSources = new Set(
          Object.keys(config.redirects ?? {}).flatMap((source) => [source, `${source}/`])
        );
      },
      "astro:build:done": async ({ dir, logger, pages }) => {
        await indexPagefindSite({ dir, logger });

        const site = sitemapSite?.url;
        if (site) {
          const contentPages = pages.filter(({ pathname }) => {
            const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
            return !redirectSources.has(path);
          });
          await writeSitemap({ dir, pages: contentPages, site, logger });
        } else {
          warnMissingSitemapSite(logger);
        }

        // BaseLayout only emits og:image tags for generated images when
        // siteConfig.ogImage is unset, so this renders exactly those files.
        await writeOgImages({ dir, site, logger });
        if (llmsTxt) await writeLlmsFiles({ dir, site, logger });
        await checkLinks({ dir, base, mode: linkCheck, logger });
      }
    }
  };
}
