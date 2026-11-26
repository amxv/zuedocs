export interface SiteConfig {
  name: string;
  strapline: string;
  description: string;
  repoUrl: string;
  logoHref?: string;
  faviconHref?: string;
  accentColor?: string;
  accentColorDark?: string;
  themeToggle?: boolean;
  /**
   * Social preview image for every page. By default ZueDocs renders one image
   * per page at build time. Set a root-relative or absolute URL to use a fixed
   * image instead, or `false` to omit preview images.
   */
  ogImage?: string | false;
  /** @deprecated The shared footer no longer renders sections. Kept so existing configs still type-check. */
  footerSections?: readonly FooterSection[];
}

export interface PrimaryNavItem {
  href: string;
  label: string;
  external?: boolean;
}

/** @deprecated The shared footer no longer renders sections. */
export interface FooterSection {
  title: string;
  text?: string;
  linkHref?: string;
  linkLabel?: string;
  linkPrefix?: string;
  linkSuffix?: string;
}
