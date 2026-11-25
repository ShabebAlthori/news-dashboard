/** True in the static web edition (GitHub Pages build); false for the self-hosted server. */
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
/** URL prefix of the static site (e.g. "/news-dashboard" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
