import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Window } from "happy-dom";

import {
  DOCS_SEARCH_RESULT_TEMPLATE,
  installDocsSearchShortcut,
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

  test("restores themed colors after Pagefind resets custom result metadata", async () => {
    const styles = await readFile(resolve(packageRoot, "src/styles/global.css"), "utf8");
    expect(styles).toMatch(/\.docs-search \.pf-result-context \{[\s\S]*?color: var\(--pf-text-secondary\) !important;/);
    expect(styles).toMatch(/\.docs-search \.pf-result-category \{[\s\S]*?color: var\(--pf-text\) !important;/);
  });

  test("lets editable targets handle the shortcut without opening search", () => {
    const window = new Window();
    const document = window.document;
    const previousElement = globalThis.Element;
    Object.defineProperty(globalThis, "Element", { configurable: true, value: window.Element });

    try {
      let modalOpened = false;
      const searchRoot = document.createElement("div");
      searchRoot.dataset.docsSearch = "";
      const trigger = document.createElement("button");
      trigger.className = "pf-trigger-btn";
      trigger.addEventListener("click", () => {
        modalOpened = true;
      });
      searchRoot.append(trigger);
      document.body.append(searchRoot);

      const removeShortcut = installDocsSearchShortcut(document as unknown as Document);
      const fixtures = [
        ["input", document.createElement("input")],
        ["textarea", document.createElement("textarea")],
        ["select", document.createElement("select")],
        ["nested contenteditable", (() => {
          const editable = document.createElement("div");
          editable.setAttribute("contenteditable", "true");
          editable.append(document.createElement("span"));
          return editable;
        })()]
      ] as const;

      for (const [name, fixture] of fixtures) {
        const target = name === "nested contenteditable" ? fixture.firstElementChild! : fixture;
        let targetEvents = 0;
        target.addEventListener("keydown", () => {
          targetEvents += 1;
        });
        document.body.append(fixture);

        const event = new window.KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(event);

        expect(targetEvents, name).toBe(1);
        expect(modalOpened, name).toBe(false);
        expect(event.defaultPrevented, name).toBe(false);
        fixture.remove();
      }

      const ordinaryTarget = document.createElement("div");
      document.body.append(ordinaryTarget);
      const ordinaryEvent = new window.KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      ordinaryTarget.dispatchEvent(ordinaryEvent);
      expect(modalOpened).toBe(true);
      expect(ordinaryEvent.defaultPrevented).toBe(true);

      removeShortcut();
    } finally {
      Object.defineProperty(globalThis, "Element", { configurable: true, value: previousElement });
      window.close();
    }
  });

  test("uses an ordered, independently scrollable mobile header row", async () => {
    const styles = await readFile(resolve(packageRoot, "src/styles/global.css"), "utf8");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 768px)"));
    expect(mobile).toContain(".site-header__inner {\n    display: flex");
    expect(mobile).toContain("order: 1");
    expect(mobile).toContain("order: 2");
    expect(mobile).toContain("margin-left: auto");
    expect(mobile).toContain("max-width: 100%");
    expect(mobile).toContain("overflow-x: auto");
    expect(mobile).not.toContain("flex-wrap: wrap");
  });
});
