export interface SiteConfig {
  name: string;
  strapline: string;
  description: string;
  repoUrl: string;
}

export interface PrimaryNavItem {
  href: string;
  label: string;
  external?: boolean;
}
