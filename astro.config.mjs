import { defineConfig } from "astro/config";
import zuedocs from "./src/integrations/astro.ts";

export default defineConfig({
  output: "static",
  integrations: [zuedocs()]
});
