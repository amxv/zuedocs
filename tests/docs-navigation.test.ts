import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { enhanceDocsOutline, enhanceDocsPager, enhanceHeadingAnchors } from "../src/scripts/docsNavigation.ts";

const PAGE = `
  <aside class="docs-sidebar" data-docs-sidebar>
    <a class="docs-sidebar__link" href="/docs/one">One</a>
    <a class="docs-sidebar__link is-active" href="/docs/two">Two</a>
    <a class="docs-sidebar__link" href="/docs/three">Three</a>
  </aside>
  <article class="docs-article">
    <div class="docs-copy">
      <h2 id="first">First</h2>
      <h3 id="nested">Nested</h3>
    </div>
  </article>
  <aside class="docs-toc">
    <p class="docs-toc__eyebrow">On this page</p>
    <ul>
      <li><a href="#first">First</a></li>
      <li><a href="#nested">Nested</a></li>
    </ul>
  </aside>
`;

const globalKeys = ["window", "document"] as const;
let previous: Record<string, unknown> = {};

beforeEach(() => {
  const window = new Window({ url: "https://docs.example.com/docs/two" });
  window.document.body.innerHTML = PAGE;
  previous = Object.fromEntries(globalKeys.map((key) => [key, (globalThis as Record<string, unknown>)[key]]));
  Object.assign(globalThis, { window, document: window.document });
});

afterEach(() => {
  Object.assign(globalThis, previous);
});

describe("docs navigation", () => {
  test("adds Previous and Next links in sidebar order", () => {
    enhanceDocsPager();
    enhanceDocsPager();

    const pagers = document.querySelectorAll(".docs-pager");
    expect(pagers).toHaveLength(1);
    const links = Array.from(pagers[0].querySelectorAll<HTMLAnchorElement>("a"));
    expect(links.map((link) => link.getAttribute("rel"))).toEqual(["prev", "next"]);
    expect(links.map((link) => link.querySelector(".docs-pager__title")?.textContent)).toEqual(["One", "Three"]);
  });

  test("adds one labelled link to each heading", () => {
    enhanceHeadingAnchors();
    enhanceHeadingAnchors();

    const anchors = document.querySelectorAll<HTMLAnchorElement>(".docs-heading-anchor");
    expect(anchors).toHaveLength(2);
    expect(anchors[0].getAttribute("href")).toBe("#first");
    expect(anchors[0].getAttribute("aria-label")).toBe("Copy link to section: First");
  });

  test("adds the progress ring and indents nested outline entries", () => {
    enhanceDocsOutline();

    expect(document.querySelectorAll(".docs-toc__progress")).toHaveLength(1);
    const items = document.querySelectorAll(".docs-toc li");
    expect(items[0].className).toBe("");
    expect(items[1].classList.contains("docs-toc__item--depth-3")).toBe(true);
  });
});
