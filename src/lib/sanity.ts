import { createClient, type SanityClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";

let _client: SanityClient | null = null;
let _readClient: SanityClient | null = null;
let _builder: ReturnType<typeof imageUrlBuilder> | null = null;

function getProjectId(): string {
  return process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
}

function getDataset(): string {
  return process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
}

/** Write client (requires SANITY_API_TOKEN) */
export function getSanityClient(): SanityClient {
  if (!_client) {
    _client = createClient({
      projectId: getProjectId(),
      dataset: getDataset(),
      apiVersion: "2024-01-01",
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });
  }
  return _client;
}

/** Read-only client (uses CDN in production) */
export function getSanityReadClient(): SanityClient {
  if (!_readClient) {
    _readClient = createClient({
      projectId: getProjectId(),
      dataset: getDataset(),
      apiVersion: "2024-01-01",
      useCdn: process.env.NODE_ENV === "production",
    });
  }
  return _readClient;
}

function getBuilder(): ReturnType<typeof imageUrlBuilder> {
  if (!_builder) {
    _builder = imageUrlBuilder(getSanityClient());
  }
  return _builder;
}

export function sanityImageUrl(source: unknown): string {
  if (!source) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getBuilder().image(source as any).auto("format").url();
}
