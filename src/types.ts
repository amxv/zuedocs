export interface SiteConfig {
  name: string;
  strapline: string;
  description: string;
  repoUrl: string;
  themeToggle?: boolean;
  footerSections?: readonly FooterSection[];
}

export interface PrimaryNavItem {
  href: string;
  label: string;
  external?: boolean;
}

export interface FooterSection {
  title: string;
  text?: string;
  linkHref?: string;
  linkLabel?: string;
  linkPrefix?: string;
  linkSuffix?: string;
}
