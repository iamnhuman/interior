// Resolve against the page, not the origin or assets/ JS directory. This works
// for both a custom domain and GitHub Pages project paths such as /interior/.
export function pageAssetUrl(path, base = document.baseURI) {
  return new URL(path, base).href;
}
