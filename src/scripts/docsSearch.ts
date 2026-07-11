export const DOCS_SEARCH_RESULT_TEMPLATE = `<li class="pf-result">
  <div class="pf-result-card">
    <div class="pf-result-content">
      <p class="pf-result-title">
        <a class="pf-result-link" href="{{ meta.url | default(url) | safeUrl }}"{{#if options.link_target}} target="{{ options.link_target }}"{{/if}}{{#if eq(options.link_target, "_blank")}} rel="noopener"{{/if}}>{{ meta.title }}</a>
      </p>
      {{#if meta.category}}
      <p class="pf-result-context">
        <span class="pf-result-category">{{ meta.category }}</span>
        {{#if meta.description}}<span class="pf-result-description">{{ meta.description }}</span>{{/if}}
      </p>
      {{else}}
      {{#if meta.description}}<p class="pf-result-context"><span class="pf-result-description">{{ meta.description }}</span></p>{{/if}}
      {{/if}}
      {{#if excerpt}}
      <p class="pf-result-excerpt">{{+ excerpt +}}</p>
      {{/if}}
    </div>
  </div>
  {{#if sub_results}}
  <ul class="pf-heading-chips">
    {{#each sub_results as sub}}
    <li class="pf-heading-chip">
      <a class="pf-heading-link" href="{{ sub.url | safeUrl }}"{{#if options.link_target}} target="{{ options.link_target }}"{{/if}}{{#if eq(options.link_target, "_blank")}} rel="noopener"{{/if}}>{{ sub.title }}</a>
      <p class="pf-heading-excerpt">{{+ sub.excerpt +}}</p>
    </li>
    {{/each}}
  </ul>
  {{/if}}
</li>`;

export function isDocsSearchShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return event.key.toLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey;
}

export function isEditableSearchTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

export function installDocsSearchShortcut(documentRoot: Document): () => void {
  const onKeydown = (event: KeyboardEvent) => {
    if (!isDocsSearchShortcut(event) || isEditableSearchTarget(event.target)) return;

    const trigger = documentRoot.querySelector<HTMLButtonElement>("[data-docs-search] .pf-trigger-btn");
    if (!trigger) return;

    event.preventDefault();
    trigger.click();
  };

  documentRoot.addEventListener("keydown", onKeydown);
  return () => documentRoot.removeEventListener("keydown", onKeydown);
}

export function decorateDocsSearchTrigger(root: ParentNode): void {
  const trigger = root.querySelector<HTMLButtonElement>(".pf-trigger-btn");
  if (!trigger || trigger.dataset.docsShortcutReady === "true") return;

  trigger.dataset.docsShortcutReady = "true";
  trigger.setAttribute("aria-keyshortcuts", "Meta+K Control+K");

  const shortcut = document.createElement("span");
  shortcut.className = "pf-trigger-shortcut";
  shortcut.setAttribute("aria-hidden", "true");

  const modifier = document.createElement("span");
  modifier.className = "pf-trigger-key";
  modifier.textContent = /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  const key = document.createElement("span");
  key.className = "pf-trigger-key";
  key.textContent = "K";

  shortcut.append(modifier, key);
  trigger.append(shortcut);
}
