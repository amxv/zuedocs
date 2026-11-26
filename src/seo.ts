// Shared between BaseLayout (which writes the og:image URL) and the build-time
// renderer (which fills in the files those URLs point at).
export const OG_IMAGE_PREFIX = "/og/";

export function ogImagePathForPage(pathname: string): string {
  const slug = pathname.replace(/\.html$/, "").replace(/^\/+|\/+$/g, "");
  return `${OG_IMAGE_PREFIX}${slug || "index"}.png`;
}

// "Install | Example Docs" -> "Install" and "Example | Tagline" -> "Tagline",
// so social cards do not repeat the site name they already show.
export function pageTitleForSocial(title: string, siteName: string): string {
  for (const separator of [" | ", " - ", ": "]) {
    for (const suffix of [`${separator}${siteName} Docs`, `${separator}${siteName}`]) {
      if (title.endsWith(suffix) && title.length > suffix.length) return title.slice(0, -suffix.length);
    }
    const prefix = `${siteName}${separator}`;
    if (title.startsWith(prefix) && title.length > prefix.length) return title.slice(prefix.length);
  }
  return title;
}
