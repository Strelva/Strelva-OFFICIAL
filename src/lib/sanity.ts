import { createClient, type SanityClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";
import { logger } from "@/lib/logger";

let _client: SanityClient | null = null;
let _readClient: SanityClient | null = null;
let _builder: ReturnType<typeof imageUrlBuilder> | null = null;

function getProjectId(): string {
  return process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
}

function getDataset(): string {
  return process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
}

function instrumentLegacyFetch(client: SanityClient, clientKind: "read" | "write"): SanityClient {
  const fetch = client.fetch.bind(client);
  Object.defineProperty(client, "fetch", {
    configurable: true,
    value: (...args: unknown[]) => {
      const query = typeof args[0] === "string" ? args[0] : "";
      const documentType = query.match(/_type\s*==\s*["']([^"']+)["']/)?.[1];
      logger.warn("[legacy-read] Sanity fetch", {
        event: "legacy_data_source_read",
        source: "sanity",
        clientKind,
        documentType: documentType || "unknown",
      });
      return Reflect.apply(fetch, client, args);
    },
  });
  return client;
}

/** Write client (requires SANITY_API_TOKEN) */
export function getSanityClient(): SanityClient {
  if (!_client) {
    _client = instrumentLegacyFetch(
      createClient({
        projectId: getProjectId(),
        dataset: getDataset(),
        apiVersion: "2024-01-01",
        useCdn: false,
        token: process.env.SANITY_API_TOKEN,
      }),
      "write"
    );
  }
  return _client;
}

/**
 * Read client retained only for the migration fallback/teardown soak. It uses
 * an authenticated, uncached API read so locking the public dataset cannot
 * surprise a hidden reader. Every fetch emits a structured legacy-read event;
 * the teardown gate is zero of these events across a full production day.
 */
export function getSanityReadClient(): SanityClient {
  if (!_readClient) {
    _readClient = instrumentLegacyFetch(
      createClient({
        projectId: getProjectId(),
        dataset: getDataset(),
        apiVersion: "2024-01-01",
        useCdn: false,
        token: process.env.SANITY_API_TOKEN,
      }),
      "read"
    );
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
