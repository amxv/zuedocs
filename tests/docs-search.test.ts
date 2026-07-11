import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DOCS_SEARCH_RESULT_TEMPLATE,
  isDocsSearchShortcut
} from "../src/scripts/docsSearch.ts";

const packageRoot = resolve(import.meta.dir, "..");

describe("DocsSearch", () => {
  test("recognizes only the unmodified platform search shortcut", () => {
    expect(isDocsSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isDocsSearchShortcut({ key: "K", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isDocsSearchShortcut({ key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isDocsSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe(false);
  });

  test("uses the supported template extension to render metadata and linked heading results", () => {
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain("{{ meta.category }}");
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain("{{ meta.description }}");
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain("{{+ excerpt +}}");
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain("{{ sub.url | safeUrl }}");
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain("{{+ sub.excerpt +}}");
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain('<ul class="pf-heading-chips">');
    expect(DOCS_SEARCH_RESULT_TEMPLATE).toContain('<li class="pf-heading-chip">');
  });

  test("keeps the provider shortcut disabled and installs the non-capturing ZueDocs handler", async () => {
    const source = await readFile(resolve(packageRoot, "src/components/DocsSearch.astro"), "utf8");
    expect(source).toContain('shortcut="disabled"');
    expect(source).toContain("installDocsSearchShortcut(document)");
    expect(source).not.toContain("stopImmediatePropagation");
    expect(source).not.toContain('addEventListener("keydown", onKeydown, true)');
  });

  test("uses a wrapping, independently scrollable mobile navigation row", async () => {
    const styles = await readFile(resolve(packageRoot, "src/styles/global.css"), "utf8");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 768px)"));
    expect(mobile).toContain("flex-wrap: wrap");
    expect(mobile).toContain("flex: 1 1 100%");
    expect(mobile).toContain("max-width: 100%");
    expect(mobile).toContain("overflow-x: auto");
  });
});
