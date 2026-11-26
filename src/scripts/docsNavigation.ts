// Reading aids for docs pages. Everything here works from markup the docs
// pages already render (sidebar, outline, article headings), so consumers get
// it without changing their page templates.

const SVG_NS = "http://www.w3.org/2000/svg";
const LINK_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7"/><path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7"/></svg>';

function sidebarLinks() {
  const sidebar = document.querySelector<HTMLElement>("[data-docs-sidebar], .docs-sidebar");
  return sidebar ? Array.from(sidebar.querySelectorAll<HTMLAnchorElement>("a[href]")) : [];
}

// Previous / Next links at the end of the article, in sidebar order.
export function enhanceDocsPager() {
  const article = document.querySelector<HTMLElement>(".docs-article");
  if (!article || article.querySelector("[data-docs-pager]")) return;

  const links = sidebarLinks();
  const index = links.findIndex((link) => link.classList.contains("is-active") || link.getAttribute("aria-current") === "page");
  if (index === -1) return;

  const previous = links[index - 1];
  const next = links[index + 1];
  if (!previous && !next) return;

  const nav = document.createElement("nav");
  nav.className = "docs-pager";
  nav.dataset.docsPager = "true";
  nav.dataset.pagefindIgnore = "all";
  nav.setAttribute("aria-label", "Previous and next pages");

  const addLink = (link: HTMLAnchorElement | undefined, direction: "previous" | "next") => {
    if (!link) {
      nav.append(document.createElement("span"));
      return;
    }
    const item = document.createElement("a");
    item.className = `docs-pager__link docs-pager__link--${direction}`;
    item.href = link.href;
    item.rel = direction === "previous" ? "prev" : "next";

    const label = document.createElement("span");
    label.className = "docs-pager__label";
    label.textContent = direction === "previous" ? "← Previous" : "Next →";

    const title = document.createElement("span");
    title.className = "docs-pager__title";
    title.textContent = link.textContent?.trim() ?? "";

    item.append(label, title);
    nav.append(item);
  };

  addLink(previous, "previous");
  addLink(next, "next");
  article.append(nav);
}

// A link icon beside each heading. Clicking it jumps to the section like a
// normal anchor and also copies the section URL.
export function enhanceHeadingAnchors() {
  const headings = document.querySelectorAll<HTMLElement>(".docs-copy :is(h2, h3, h4)[id]");

  headings.forEach((heading) => {
    if (heading.querySelector(".docs-heading-anchor")) return;

    const anchor = document.createElement("a");
    anchor.className = "docs-heading-anchor";
    anchor.href = `#${encodeURIComponent(heading.id)}`;
    anchor.setAttribute("aria-label", `Copy link to section: ${heading.textContent?.trim() ?? ""}`);
    anchor.innerHTML = LINK_ICON;

    anchor.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.hash = heading.id;
      navigator.clipboard?.writeText(url.toString()).then(() => {
        anchor.classList.add("is-copied");
        window.setTimeout(() => anchor.classList.remove("is-copied"), 1400);
      }).catch(() => {});
    });

    heading.append(anchor);
  });
}

interface OutlineEntry {
  link: HTMLAnchorElement;
  heading: HTMLElement;
  top: number;
  linkTop: number;
  linkBottom: number;
}

function createProgressRing() {
  const wrapper = document.createElement("span");
  wrapper.className = "docs-toc__progress";
  wrapper.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");

  const track = document.createElementNS(SVG_NS, "circle");
  const bar = document.createElementNS(SVG_NS, "circle");
  for (const circle of [track, bar]) {
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "6.5");
    circle.setAttribute("pathLength", "100");
  }
  track.setAttribute("class", "docs-toc__progress-track");
  bar.setAttribute("class", "docs-toc__progress-bar");

  svg.append(track, bar);
  wrapper.append(svg);
  return { wrapper, bar };
}

// Highlights the section being read in "On this page" and fills a small
// progress ring as the reader moves through the article.
//
// Kept cheap: one passive scroll listener batched to a frame, heading
// positions cached and only re-measured when the article resizes (images,
// Mermaid diagrams, viewport changes), and DOM writes only on change.
export function enhanceDocsOutline() {
  const toc = document.querySelector<HTMLElement>(".docs-toc");
  const article = document.querySelector<HTMLElement>(".docs-article");
  if (!toc || !article || toc.dataset.docsOutline === "true") return;
  toc.dataset.docsOutline = "true";

  const entries: OutlineEntry[] = [];
  toc.querySelectorAll<HTMLAnchorElement>("a[href^='#']").forEach((link) => {
    const id = decodeURIComponent(link.hash.slice(1));
    const heading = id ? document.getElementById(id) : null;
    if (!heading) return;
    const depth = Number(heading.tagName.slice(1));
    if (depth >= 3) link.parentElement?.classList.add(`docs-toc__item--depth-${Math.min(depth, 4)}`);
    entries.push({ link, heading, top: 0, linkTop: 0, linkBottom: 0 });
  });

  const eyebrow = toc.querySelector<HTMLElement>(".docs-toc__eyebrow");
  const ring = createProgressRing();
  eyebrow?.prepend(ring.wrapper);

  // Everything the scroll handler needs is measured here, outside the scroll
  // path. The handler then reads only window.scrollY (and the outline's own
  // scrollTop) before writing, so scrolling never forces a synchronous layout.
  let articleTop = 0;
  let articleBottom = 0;
  let viewport = 0;
  let documentHeight = 0;
  let activationOffset = 0;
  let tocHeight = 0;
  let tocScrollable = false;
  let visible = true;
  let frame = 0;
  let activeIndex = -2;
  let lastStep = -1;

  const measure = () => {
    const scrollY = window.scrollY;
    const articleRect = article.getBoundingClientRect();
    articleTop = articleRect.top + scrollY;
    articleBottom = articleRect.bottom + scrollY;
    viewport = window.innerHeight;
    documentHeight = document.documentElement.scrollHeight;
    activationOffset = Math.min(viewport * 0.3, 220);
    visible = toc.offsetParent !== null;
    tocHeight = toc.clientHeight;
    tocScrollable = toc.scrollHeight > tocHeight + 1;
    for (const entry of entries) {
      entry.top = entry.heading.getBoundingClientRect().top + scrollY;
      // The outline is sticky, so it is the offsetParent of its links.
      entry.linkTop = entry.link.offsetTop;
      entry.linkBottom = entry.linkTop + entry.link.offsetHeight;
    }
  };

  const update = () => {
    frame = 0;
    if (!visible) return;

    // Reads first.
    const scrollY = window.scrollY;
    const tocScrollTop = tocScrollable ? toc.scrollTop : 0;

    const start = articleTop - viewport * 0.25;
    const end = Math.max(articleBottom - viewport, start + 1);
    const progress = Math.min(Math.max((scrollY - start) / (end - start), 0), 1);
    // 200 steps is smoother than the ring can show at its size.
    const step = Math.round(progress * 200);

    let nextActive = -1;
    if (entries.length > 0 && scrollY + viewport >= documentHeight - 2) {
      nextActive = entries.length - 1;
    } else {
      const line = scrollY + activationOffset;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].top <= line) {
          nextActive = index;
          break;
        }
      }
    }

    // Then writes, only when something changed.
    if (step !== lastStep) {
      lastStep = step;
      ring.bar.style.strokeDashoffset = String(100 - step / 2);
    }

    if (nextActive === activeIndex) return;
    const previous = entries[activeIndex]?.link;
    previous?.classList.remove("is-active");
    previous?.removeAttribute("aria-current");
    activeIndex = nextActive;

    const active = entries[activeIndex];
    if (!active) return;
    active.link.classList.add("is-active");
    active.link.setAttribute("aria-current", "location");
    if (tocScrollable && (active.linkTop < tocScrollTop + 32 || active.linkBottom > tocScrollTop + tocHeight - 32)) {
      toc.scrollTop = active.linkTop - tocHeight / 2;
    }
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  const remeasure = () => {
    measure();
    schedule();
  };

  measure();
  update();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", remeasure, { passive: true });
  // Headings move when fonts load, Mermaid renders, or images arrive.
  if (window.ResizeObserver) {
    new window.ResizeObserver(remeasure).observe(article);
  }
}
