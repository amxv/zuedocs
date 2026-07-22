import { defineConfig } from "astro/config";
import zuedocs from "zuedocs-published/astro";

export default defineConfig({
  output: "static",
  integrations: [zuedocs()]
});
