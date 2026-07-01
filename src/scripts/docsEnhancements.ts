const COPY_RESET_MS = 1600;
const ICON_COPY = "⧉";
const ICON_CHECK = "✓";
const ICON_EXPAND = "⛶";
const ICON_CLOSE = "×";

function setIconButton(button: HTMLButtonElement, icon: string, label: string) {
  button.textContent = icon;
  button.setAttribute("aria-label", label);
  button.title = label;
}

function getCodeLanguage(pre: HTMLPreElement, code: HTMLElement | null) {
  const dataLanguage = pre.dataset.language;
  if (dataLanguage) return dataLanguage;

  const className = code?.className ?? "";
  const match = className.match(/language-([^\s]+)/);
  return match?.[1] ?? "text";
}

function labelForLanguage(language: string) {
  if (!language || language === "text") return "Text";
  if (language === "sh" || language === "shell" || language === "bash") return "Shell";
  if (language === "toml") return "TOML";
  if (language === "json") return "JSON";
  if (language === "yaml" || language === "yml") return "YAML";
  if (language === "http") return "HTTP";
  if (language === "mermaid") return "Mermaid";
  return language.replace(/-/g, " ").replace(/\b\w/g, (char: string) => char.toUpperCase());
}

async function copyText(text: string, button: HTMLButtonElement) {
  const originalLabel = button.getAttribute("aria-label") ?? "Copy code block";

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable in this browser context");
    }

    await navigator.clipboard.writeText(text);

    setIconButton(button, ICON_CHECK, "Copied");
    button.classList.add("is-copied");
  } catch (error) {
    console.warn("Unable to copy code block", error);
    setIconButton(button, "!", "Copy failed");
    button.classList.add("is-failed");
  }

  window.setTimeout(() => {
    setIconButton(button, ICON_COPY, originalLabel);
    button.classList.remove("is-copied", "is-failed");
  }, COPY_RESET_MS);
}

function hasExpandedDiagram() {
  return Boolean(document.querySelector(".docs-codeblock--diagram.is-expanded"));
}

function setExpandedDiagram(wrapper: HTMLElement, active: boolean) {
  wrapper.classList.toggle("is-expanded", active);
  document.body.classList.toggle("has-docs-expanded-diagram", hasExpandedDiagram());
}

function setExpandButtonState(wrapper: HTMLElement, button: HTMLButtonElement) {
  const isActive = wrapper.classList.contains("is-expanded");

  setIconButton(
    button,
    isActive ? ICON_CLOSE : ICON_EXPAND,
    isActive ? "Close expanded Mermaid diagram" : "Expand Mermaid diagram to full screen"
  );
  button.setAttribute("aria-pressed", String(isActive));
}

function addDiagramExpandButton(wrapper: HTMLElement, actions: HTMLElement) {
  const expandButton = document.createElement("button");
  expandButton.className = "docs-codeblock__copy docs-codeblock__fullscreen";
  expandButton.type = "button";
  setExpandButtonState(wrapper, expandButton);

  expandButton.addEventListener("click", () => {
    setExpandedDiagram(wrapper, !wrapper.classList.contains("is-expanded"));
    setExpandButtonState(wrapper, expandButton);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !wrapper.classList.contains("is-expanded")) return;

    setExpandedDiagram(wrapper, false);
    setExpandButtonState(wrapper, expandButton);
  });

  actions.prepend(expandButton);
}

function enhanceCodeBlocks() {
  const blocks = document.querySelectorAll<HTMLPreElement>(".docs-copy pre:not([data-docs-enhanced])");
  const mermaidNodes: HTMLElement[] = [];

  blocks.forEach((pre) => {
    const code = pre.querySelector<HTMLElement>("code");
    const source = code?.textContent ?? pre.textContent ?? "";
    const language = getCodeLanguage(pre, code);
    const isMermaid = language === "mermaid";

    pre.dataset.docsEnhanced = "true";

    const wrapper = document.createElement("div");
    wrapper.className = isMermaid ? "docs-codeblock docs-codeblock--diagram" : "docs-codeblock";

    const header = document.createElement("div");
    header.className = "docs-codeblock__header";

    const languageLabel = document.createElement("span");
    languageLabel.className = "docs-codeblock__language";
    languageLabel.textContent = labelForLanguage(language);

    const actions = document.createElement("div");
    actions.className = "docs-codeblock__actions";

    const copyButton = document.createElement("button");
    copyButton.className = "docs-codeblock__copy";
    copyButton.type = "button";
    setIconButton(copyButton, ICON_COPY, `Copy ${labelForLanguage(language)} code block`);
    copyButton.addEventListener("click", () => copyText(source, copyButton));

    actions.append(copyButton);

    if (isMermaid) {
      addDiagramExpandButton(wrapper, actions);
    }

    header.append(languageLabel, actions);
    pre.before(wrapper);
    wrapper.append(header);

    if (isMermaid) {
      const diagram = document.createElement("div");
      diagram.className = "docs-mermaid mermaid";
      diagram.textContent = source;
      wrapper.append(diagram);
      pre.remove();
      mermaidNodes.push(diagram);
    } else {
      wrapper.append(pre);
    }
  });

  return mermaidNodes;
}

function enhanceTables() {
  const tables = document.querySelectorAll<HTMLTableElement>(".docs-copy table:not([data-docs-enhanced])");

  tables.forEach((table) => {
    table.dataset.docsEnhanced = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "docs-table";
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Scrollable documentation table");
    wrapper.tabIndex = 0;

    table.before(wrapper);
    wrapper.append(table);
  });
}

async function renderMermaidDiagrams(nodes: HTMLElement[]) {
  if (nodes.length === 0) return;

  const { default: mermaid } = await import("mermaid");

  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
    fontFamily: "Inter, system-ui, sans-serif"
  });

  try {
    await mermaid.run({ nodes });
  } catch (error) {
    console.warn("Unable to render Mermaid diagram", error);
    nodes.forEach((node) => {
      node.classList.add("is-error");
      node.setAttribute("role", "note");
      node.setAttribute("aria-label", "Mermaid diagram source could not be rendered");
    });
  }
}


function getCleanCurrentUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url;
}

function getMarkdownUrl() {
  const url = getCleanCurrentUrl();

  if (url.pathname.endsWith(".md")) {
    return url.href;
  }

  if (url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname.slice(0, -1)}.md`;
  } else {
    url.pathname = `${url.pathname}.md`;
  }

  return url.href;
}

function getRenderedPageUrl() {
  const url = getCleanCurrentUrl();

  if (url.pathname.endsWith(".md")) {
    url.pathname = url.pathname.slice(0, -3);
  }

  return url.href;
}

function getAskUrl(base: string, parameter: string, sourceUrl: string) {
  const url = new URL(base);
  url.searchParams.set(parameter, `Read from ${sourceUrl} so I can ask questions about it.`);
  return url.href;
}

async function writeToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback below. Some browser contexts expose
      // navigator.clipboard but still reject writes without a user gesture.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";

  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy fallback failed");
  }
}

function setDocsPageActionStatus(root: HTMLElement, text: string, state: "idle" | "copying" | "copied" | "failed") {
  const copyButton = root.querySelector<HTMLButtonElement>("[data-docs-page-copy]");
  const copyLabel = root.querySelector<HTMLElement>("[data-docs-page-copy-label]");

  if (copyLabel) copyLabel.textContent = text;

  if (copyButton) {
    copyButton.classList.toggle("is-copying", state === "copying");
    copyButton.classList.toggle("is-copied", state === "copied");
    copyButton.classList.toggle("is-failed", state === "failed");
    copyButton.setAttribute(
      "aria-label",
      state === "copied" ? "Copied page as Markdown" : state === "failed" ? "Copy failed" : "Copy page as Markdown"
    );
  }
}

async function copyMarkdownPage(root: HTMLElement) {
  const markdownUrl = getMarkdownUrl();

  setDocsPageActionStatus(root, "Copy page", "copying");

  try {
    const response = await fetch(markdownUrl, {
      headers: {
        Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`Markdown source returned ${response.status}`);
    }

    const markdown = await response.text();
    await writeToClipboard(markdown);
    setDocsPageActionStatus(root, "Copied", "copied");
  } catch (error) {
    console.warn("Unable to copy markdown page", error);
    setDocsPageActionStatus(root, "Copy failed", "failed");
  }

  window.setTimeout(() => {
    setDocsPageActionStatus(root, "Copy page", "idle");
  }, COPY_RESET_MS);
}

function enhanceDocsPageActions() {
  const roots = document.querySelectorAll<HTMLElement>("[data-docs-page-actions]:not([data-docs-enhanced])");

  roots.forEach((root) => {
    root.dataset.docsEnhanced = "true";

    const details = root.querySelector<HTMLDetailsElement>(".docs-page-actions__details");
    const copyButton = root.querySelector<HTMLButtonElement>("[data-docs-page-copy]");
    const markdownLink = root.querySelector<HTMLAnchorElement>("[data-docs-page-markdown]");
    const chatgptLink = root.querySelector<HTMLAnchorElement>("[data-docs-page-chatgpt]");
    const claudeLink = root.querySelector<HTMLAnchorElement>("[data-docs-page-claude]");
    const markdownUrl = getMarkdownUrl();
    const renderedPageUrl = getRenderedPageUrl();

    if (markdownLink) {
      markdownLink.href = markdownUrl;
      markdownLink.target = "_blank";
      markdownLink.rel = "noreferrer";
    }

    if (chatgptLink) {
      chatgptLink.href = getAskUrl("https://" + "chatgpt.com/", "prompt", renderedPageUrl);
      chatgptLink.target = "_blank";
      chatgptLink.rel = "noreferrer";
    }

    if (claudeLink) {
      claudeLink.href = getAskUrl("https://" + "claude.ai/new", "q", markdownUrl);
      claudeLink.target = "_blank";
      claudeLink.rel = "noreferrer";
    }

    copyButton?.addEventListener("click", () => copyMarkdownPage(root));

    document.addEventListener("click", (event) => {
      if (!details?.open) return;
      const target = event.target;
      if (target instanceof Node && !root.contains(target)) {
        details.removeAttribute("open");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && details?.open) {
        details.removeAttribute("open");
      }
    });
  });
}


function enhanceMobileDocsSidebar() {
  const sidebar = document.querySelector<HTMLElement>("[data-docs-sidebar], .docs-sidebar");
  const toggles = document.querySelectorAll<HTMLButtonElement>("[data-docs-sidebar-toggle]");

  if (!sidebar) {
    toggles.forEach((toggle) => {
      toggle.hidden = true;
    });
    return;
  }

  sidebar.dataset.docsSidebar = "true";
  if (!sidebar.id) {
    sidebar.id = "docs-sidebar";
  }

  let backdrop = document.querySelector<HTMLButtonElement>("[data-docs-sidebar-close]");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "docs-sidebar-backdrop";
    backdrop.dataset.docsSidebarClose = "true";
    backdrop.setAttribute("aria-label", "Close docs menu");
    sidebar.after(backdrop);
  }

  const setOpen = (open: boolean) => {
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("has-docs-sidebar-open", open);
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-controls", sidebar.id);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close docs menu" : "Open docs menu");
    });
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      setOpen(!sidebar.classList.contains("is-open"));
    });
  });

  backdrop.addEventListener("click", () => setOpen(false));

  sidebar.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      setOpen(false);
    }
  });
}

async function initDocsEnhancements() {
  const mermaidNodes = enhanceCodeBlocks();
  enhanceTables();
  enhanceDocsPageActions();
  enhanceMobileDocsSidebar();
  await renderMermaidDiagrams(mermaidNodes);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDocsEnhancements, { once: true });
} else {
  initDocsEnhancements();
}
