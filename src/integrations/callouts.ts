// Turns GitHub-style alert blockquotes into styled callouts at build time:
//
//   > [!NOTE]
//   > Body text.
//
// The raw Markdown routes keep the GitHub syntax, so the same source renders
// correctly on GitHub and in agents that read the `.md` pages.

export const CALLOUT_TYPES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
} as const;

export type CalloutType = keyof typeof CALLOUT_TYPES;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const MARKER = /^\s*\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i;

function isWhitespaceText(node: HastNode) {
  return node.type === "text" && !node.value?.trim();
}

export function transformBlockquote(node: HastNode): boolean {
  const children = node.children ?? [];
  const firstParagraph = children.find((child) => !isWhitespaceText(child));
  if (firstParagraph?.type !== "element" || firstParagraph.tagName !== "p") return false;

  const firstText = firstParagraph.children?.[0];
  if (firstText?.type !== "text" || !firstText.value) return false;

  const match = MARKER.exec(firstText.value);
  if (!match) return false;

  const type = match[1].toLowerCase() as CalloutType;
  firstText.value = firstText.value.slice(match[0].length);

  // A marker followed by a hard break leaves a leading <br>; drop it.
  const paragraphChildren = firstParagraph.children ?? [];
  while (paragraphChildren.length > 0) {
    const head = paragraphChildren[0];
    if (isWhitespaceText(head) || (head.type === "element" && head.tagName === "br")) {
      paragraphChildren.shift();
    } else {
      break;
    }
  }

  const body = paragraphChildren.length > 0
    ? children
    : children.filter((child) => child !== firstParagraph);

  node.tagName = "div";
  node.properties = {
    className: ["docs-callout", `docs-callout--${type}`],
    role: "note"
  };
  node.children = [
    {
      type: "element",
      tagName: "p",
      properties: { className: ["docs-callout__title"] },
      children: [{ type: "text", value: CALLOUT_TYPES[type] }]
    },
    ...body
  ];
  return true;
}

// Sätteri nodes are lazy views over a Rust-side tree and cannot go through
// structuredClone, so copy the fields a HAST node can carry by hand.
function toPlainNode(node: HastNode): HastNode {
  const copy: HastNode = { type: node.type };
  if (node.tagName !== undefined) copy.tagName = node.tagName;
  if (node.value !== undefined) copy.value = node.value;
  if (node.properties) copy.properties = { ...node.properties };
  if (node.children) copy.children = Array.from(node.children, toPlainNode);
  return copy;
}

// Sätteri (Astro's default Markdown processor) HAST plugin. Nodes handed to
// visitors are read-only views, so the visitor works on a detached copy and
// returns the rebuilt callout to replace the blockquote.
export const satteriCalloutsPlugin = {
  name: "zuedocs-callouts",
  element: {
    filter: ["blockquote"],
    visit(node: HastNode) {
      const copy = toPlainNode(node);
      return transformBlockquote(copy) ? copy : undefined;
    }
  }
};

function visit(node: HastNode) {
  if (node.type === "element" && node.tagName === "blockquote") {
    transformBlockquote(node);
  }
  node.children?.forEach(visit);
}

// unified/rehype form, for sites that switch to `@astrojs/markdown-remark`.
export function rehypeDocsCallouts() {
  return (tree: HastNode) => {
    visit(tree);
  };
}
