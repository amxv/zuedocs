import type { AstroIntegration } from "astro";

import { indexPagefindSite } from "./pagefind.ts";

export default function zuedocs(): AstroIntegration {
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
      "astro:build:done": async ({ dir, logger }) => {
        await indexPagefindSite({ dir, logger });
      }
    }
  };
}
