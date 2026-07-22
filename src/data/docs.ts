export const siteConfig = {
  name: "ZueDocs",
  strapline: "Astro documentation template",
  description:
    "A polished Astro docs template with an editorial landing page, structured content collections, and deployment guidance for Vercel plus Cloudflare DNS.",
  repoUrl: "https://github.com/amxv/zuedocs"
} as const;

export const docCategories = [
  "Launch",
  "Structure",
  "Operations"
] as const;

export const primaryNav = [
  { href: "/docs", label: "Docs" },
  { href: siteConfig.repoUrl, label: "GitHub", external: true }
];
