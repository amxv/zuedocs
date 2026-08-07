import type { AstroIntegration } from "astro";

import { indexPagefindSite } from "./pagefind.ts";
import {
  resolveSitemapSite,
  warnMissingSitemapSite,
  writeSitemap,
  type ResolvedSitemapSite
} from "./sitemap.ts";

export default function zuedocs(): AstroIntegration {
  let sitemapSite: ResolvedSitemapSite | undefined;

  return {
    name: "amxv:zuedocs",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          markdown: {
            shikiConfig: {
              theme: "css-variables"
            }
          }
        });
      },
      "astro:config:done": ({ config }) => {
        sitemapSite = resolveSitemapSite({ astroSite: config.site });
      },
      "astro:build:done": async ({ dir, logger, pages }) => {
        await indexPagefindSite({ dir, logger });

        if (!sitemapSite) {
          warnMissingSitemapSite(logger);
          return;
        }

        await writeSitemap({ dir, pages, site: sitemapSite.url, logger });
      }
    }
  };
}
