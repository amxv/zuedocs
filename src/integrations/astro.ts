import type { AstroIntegration } from "astro";

import { indexPagefindSite } from "./pagefind.ts";

export default function zuedocs(): AstroIntegration {
  return {
    name: "amxv:zuedocs",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        await indexPagefindSite({ dir, logger });
      }
    }
  };
}

export { indexPagefindSite } from "./pagefind.ts";
export type {
  IndexPagefindSiteOptions,
  IndexPagefindSiteResult,
  PagefindApi,
  PagefindLogger
} from "./pagefind.ts";
