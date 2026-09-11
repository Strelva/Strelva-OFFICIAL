import { describe, expect, it, vi } from "vitest";
import {
  createHomeFinderServerAdapter,
} from "../products/home-finder/server-adapter";
import {
  HOME_FINDER_MANAGEMENT_OPERATIONS,
  HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
  type HomeFinderAdapterError,
  type HomeFinderInstallationScope,
} from "../products/home-finder/types";

const KEY = "home-finder-management-test-key-0123456789";
const NOW = new Date("2026-09-08T12:00:00.000Z");
const INSTALLATION_ID = "agency-preview";
const scope: HomeFinderInstallationScope = {
  installationId: INSTALLATION_ID,
  managementReads: HOME_FINDER_MANAGEMENT_OPERATIONS,
};

const readiness = [
  {
    requirement: "provider/MLS authorization",
    state: "unverified",
    source: "Configuration only",
    observedAt: NOW.toISOString(),
    responsibleParty: "MLS/provider",
  },
];

const summary = {
  schemaVersion: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
  id: INSTALLATION_ID,
  brokerageName: "Example Brokerage",
  mode: "demo",
  previewHref: "/embed/agency-preview",
  observedAt: NOW.toISOString(),
  readiness,
};

function response(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function adapter(fetchMock: ReturnType<typeof vi.fn>, options: Record<string, unknown> = {}) {
  return createHomeFinderServerAdapter({
    baseUrl: "https://idx.example",
    signingKey: KEY,
    fetchImpl: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    ...options,
  });
}

function requestInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return fetchMock.mock.calls[0]?.[1] as RequestInit;
}

function credentialClaims(fetchMock: ReturnType<typeof vi.fn>) {
  const headers = new Headers(requestInit(fetchMock).headers);
  const token = headers.get("authorization")?.slice("Bearer ".length) ?? "";
  const [, payload] = token.split(".");
  if (!payload) throw new Error("test credential payload missing");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    v: string;
    iss: string;
    aud: string;
    op: string;
    installationId: string;
    correlationId: string;
    iat: number;
    exp: number;
  };
}

describe("Home Finder server adapter", () => {
  it("sends a dedicated no-store, redirect-blocked credential and returns only safe summary keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...summary,
        privateBuyerEmail: "buyer-secret@example.test",
        destination: "destination-secret@example.test",
        providerMessageId: "provider-secret",
        notificationState: "sent",
        readiness: [
          {
            ...readiness[0],
            buyer: "buyer-secret",
            destination: "destination-secret",
          },
        ],
      }),
    );
    const result = await adapter(fetchMock).readInstallationSummary(scope, {
      correlationId: "correlation-1",
    });

    expect(result).toEqual(summary);
    expect(JSON.stringify(result)).not.toContain("buyer-secret");
    expect(JSON.stringify(result)).not.toContain("destination-secret");
    expect(JSON.stringify(result)).not.toContain("provider-secret");
    expect(Object.keys(result).sort()).toEqual([
      "brokerageName",
      "id",
      "mode",
      "observedAt",
      "previewHref",
      "readiness",
      "schemaVersion",
    ]);

    const init = requestInit(fetchMock);
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
    const headers = new Headers(init.headers);
    expect(headers.get("cache-control")).toBe("no-store");
    expect(headers.get("x-strelva-correlation-id")).toBe("correlation-1");
    expect(credentialClaims(fetchMock)).toMatchObject({
      v: "1",
      iss: "strelva-reb",
      aud: "strelva-idx-management",
      op: "readInstallationSummary",
      installationId: INSTALLATION_ID,
      correlationId: "correlation-1",
    });
    const claims = credentialClaims(fetchMock);
    expect(claims.exp - claims.iat).toBe(60);
  });

  it("accepts only an IDX-origin synthetic preview path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...summary,
        previewHref: "https://evil.example/embed/agency-preview",
      }),
    );
    await expect(adapter(fetchMock).readInstallationSummary(scope)).rejects.toMatchObject({
      code: "schema_mismatch",
    } satisfies Partial<HomeFinderAdapterError>);

    fetchMock.mockResolvedValue(
      response({
        ...summary,
        previewHref: "https://idx.example/embed/agency-preview",
      }),
    );
    await expect(adapter(fetchMock).readInstallationSummary(scope)).resolves.toMatchObject({
      previewHref: "https://idx.example/embed/agency-preview",
    });
  });

  it("requires the fixed authorized operation and installation echo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ...summary, id: "another-installation" }),
    );
    await expect(adapter(fetchMock).readInstallationSummary(scope)).rejects.toMatchObject({
      code: "schema_mismatch",
    });

    const restrictedScope: HomeFinderInstallationScope = {
      installationId: INSTALLATION_ID,
      managementReads: ["readInstallationSummary"],
    };
    await expect(adapter(fetchMock).readReadiness(restrictedScope)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates schema, installation echoes, safe receipt keys, and detail references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        schemaVersion: "1",
        installationId: INSTALLATION_ID,
        observedAt: NOW.toISOString(),
        items: [
          {
            reference: "hfr1.safe-reference",
            state: "delivered",
            occurredAt: NOW.toISOString(),
            expiresAt: "2026-10-08T12:00:00.000Z",
            listingAddress: "Private Street",
            destination: "private-destination@example.test",
            providerMessageId: "provider-secret",
            notificationState: "sent",
          },
        ],
        nextCursor: "hfc1.opaque-cursor",
      }),
    );
    const page = await adapter(fetchMock).listDeliveryReceipts(scope, {
      limit: 1,
      correlationId: "list-correlation",
    });
    expect(page.items[0]).toEqual({
      reference: "hfr1.safe-reference",
      state: "delivered",
      occurredAt: NOW.toISOString(),
      expiresAt: "2026-10-08T12:00:00.000Z",
    });
    expect(JSON.stringify(page)).not.toContain("Private Street");
    expect(JSON.stringify(page)).not.toContain("provider-secret");
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      "expiresAt",
      "occurredAt",
      "reference",
      "state",
    ]);
    expect(credentialClaims(fetchMock)).toMatchObject({
      op: "listDeliveryReceipts",
      installationId: INSTALLATION_ID,
      correlationId: "list-correlation",
    });

    fetchMock.mockResolvedValue(
      response({
        schemaVersion: "1",
        installationId: "another-installation",
        observedAt: NOW.toISOString(),
        items: [],
      }),
    );
    await expect(adapter(fetchMock).listDeliveryReceipts(scope)).rejects.toMatchObject({
      code: "schema_mismatch",
    });

    fetchMock.mockResolvedValue(
      response({
        schemaVersion: "1",
        installationId: INSTALLATION_ID,
        observedAt: NOW.toISOString(),
        reference: "hfr1.other-reference",
        state: "delivered",
        occurredAt: NOW.toISOString(),
        expiresAt: "2026-10-08T12:00:00.000Z",
      }),
    );
    await expect(
      adapter(fetchMock).readDeliveryReceipt(scope, "hfr1.request-reference"),
    ).rejects.toMatchObject({ code: "schema_mismatch" });

    fetchMock.mockResolvedValue(
      response({ schemaVersion: "1", installationId: INSTALLATION_ID }),
    );
    await expect(adapter(fetchMock).readReadiness(scope)).rejects.toMatchObject({
      code: "schema_mismatch",
    });
  });

  it("bounds cursors and maps unavailable stores without exposing provider details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ error: "sqlite path /private/secret" }, 503),
    );
    await expect(adapter(fetchMock).readReadiness(scope)).rejects.toMatchObject({
      code: "source_unavailable",
      status: 503,
      retryable: true,
    });
    expect(() =>
      adapter(fetchMock).listDeliveryReceipts(scope, { cursor: "bad\nforgery" }),
    ).toThrowError(
      expect.objectContaining({ code: "invalid_request", status: 400 }),
    );
  });

  it("times out both a hanging fetch and a hanging response body", async () => {
    const neverFetch = vi.fn(() => new Promise<Response>(() => {}));
    await expect(
      adapter(neverFetch, { timeoutMs: 10 }).readReadiness(scope),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });

    const hangingBody = new ReadableStream<Uint8Array>({
      start() {
        // Keep the reader pending to exercise the body timeout, not just
        // fetch-header cancellation.
      },
    });
    const hangingFetch = vi.fn().mockResolvedValue(
      new Response(hangingBody, { status: 200 }),
    );
    await expect(
      adapter(hangingFetch, { timeoutMs: 10 }).readReadiness(scope),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("rejects oversized response bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(summary, 200, { "content-length": "2048" }),
    );
    await expect(
      adapter(fetchMock, { maxResponseBytes: 1_024 }).readInstallationSummary(scope),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });
});
