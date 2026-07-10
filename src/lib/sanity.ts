/**
 * Residual Sanity image-URL resolver — the last live tie to Sanity.
 *
 * Sanity is decommissioned as a data source; the only thing left is rendering
 * legacy content images whose stored value is still a Sanity asset ref. Those
 * are served read-only from the Sanity CDN (kept in the CSP + next.config
 * remotePatterns) until the content-URL rewrite ops step runs, after which this
 * file and the `@sanity/image-url` dep can be deleted.
 *
 * Built from project config directly — no `@sanity/client`.
 */
import imageUrlBuilder from "@sanity/image-url";

let _builder: ReturnType<typeof imageUrlBuilder> | null = null;

function getBuilder(): ReturnType<typeof imageUrlBuilder> {
  if (!_builder) {
    _builder = imageUrlBuilder({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
    });
  }
  return _builder;
}

export function sanityImageUrl(source: unknown): string {
  if (!source) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getBuilder().image(source as any).auto("format").url();
}
