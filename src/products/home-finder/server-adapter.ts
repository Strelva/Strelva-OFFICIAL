import {
  createHmac,
  randomUUID,
} from "node:crypto";
import {
  HOME_FINDER_MANAGEMENT_OPERATIONS,
  HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
  HomeFinderAdapterError,
  type HomeFinderDeliveryDetail,
  type HomeFinderDeliveryPage,
  type HomeFinderDeliverySummary,
  type HomeFinderInstallationScope,
  type HomeFinderInstallationSummary,
  type HomeFinderManagementOperation,
  type HomeFinderReadOptions,
  type HomeFinderReadiness,
  type HomeFinderReadinessItem,
  type HomeFinderReceiptListOptions,
  type HomeFinderServerAdapterOptions,
} from "./types";

const ISSUER = "strelva-reb";
const AUDIENCE = "strelva-idx-management";
const CREDENTIAL_PREFIX = "hfm1";
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1_024;
const MAX_REFERENCE_BYTES = 2 * 1_024;
const MAX_CURSOR_BYTES = 2 * 1_024;

type FetchLike = typeof fetch;

type CredentialClaims = {
  v: typeof HOME_FINDER_MANAGEMENT_SCHEMA_VERSION;
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
  op: HomeFinderManagementOperation;
  installationId: string;
  correlationId: string;
  iat: number;
  exp: number;
  cursor?: string;
  reference?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, max = 2_048): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  return value;
}

function isoValue(value: unknown): string | null {
  const text = textValue(value, 64);
  if (!text || Number.isNaN(Date.parse(text))) return null;
  return text;
}

function signingKey(value: string | Uint8Array): Uint8Array {
  const key = typeof value === "string" ? new TextEncoder().encode(value) : value;
  if (key.byteLength < 32) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "Home Finder management authentication is unavailable.",
    );
  }
  return key;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function hmac(value: string, key: Uint8Array): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function credential(
  input: {
    operation: HomeFinderManagementOperation;
    installationId: string;
    correlationId: string;
    issuedAt: number;
    expiresAt: number;
    cursor?: string;
    reference?: string;
  },
  key: Uint8Array,
): string {
  const claims: CredentialClaims = {
    v: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
    iss: ISSUER,
    aud: AUDIENCE,
    op: input.operation,
    installationId: input.installationId,
    correlationId: input.correlationId,
    iat: input.issuedAt,
    exp: input.expiresAt,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.reference === undefined ? {} : { reference: input.reference }),
  };
  const payload = encode(JSON.stringify(claims));
  const signed = `${CREDENTIAL_PREFIX}.${payload}`;
  return `${signed}.${hmac(signed, key)}`;
}

function correlationId(value: string | undefined): string {
  const resolved = value?.trim() || randomUUID();
  if (!textValue(resolved, 160)) {
    throw new HomeFinderAdapterError(
      "invalid_request",
      "The Home Finder management correlation ID is invalid.",
    );
  }
  return resolved;
}

function scopeInstallationId(scope: HomeFinderInstallationScope): string {
  if (!scope || typeof scope !== "object") {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "A fixed authorized Home Finder installation scope is required.",
    );
  }
  const installationId = textValue(scope.installationId, 160);
  if (!installationId) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "A fixed authorized Home Finder installation scope is required.",
    );
  }
  if (
    !Array.isArray(scope.managementReads) ||
    scope.managementReads.some(
      (operation) =>
        !(HOME_FINDER_MANAGEMENT_OPERATIONS as readonly string[]).includes(
          operation,
        ),
    )
  ) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "The Home Finder installation scope is invalid.",
    );
  }
  return installationId;
}

function assertOperation(
  scope: HomeFinderInstallationScope,
  operation: HomeFinderManagementOperation,
): string {
  const installationId = scopeInstallationId(scope);
  if (!scope.managementReads.includes(operation)) {
    throw new HomeFinderAdapterError(
      "forbidden",
      "This Home Finder operation is not authorized for the installation.",
      { status: 403 },
    );
  }
  return installationId;
}

function normalizeBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("unsafe base URL");
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch (cause) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "The Home Finder management endpoint is invalid.",
      { cause },
    );
  }
}

function makeUrl(baseUrl: URL, path: string, query?: Record<string, string | undefined>): URL {
  const url = new URL(path.replace(/^\//, ""), baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HomeFinderAdapterError(
      "response_too_large",
      "The Home Finder management response is too large.",
      { retryable: false },
    );
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new HomeFinderAdapterError(
        "response_too_large",
        "The Home Finder management response is too large.",
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HomeFinderAdapterError(
          "response_too_large",
          "The Home Finder management response is too large.",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function providerError(status: number): HomeFinderAdapterError {
  if (status === 401) {
    return new HomeFinderAdapterError(
      "unauthenticated",
      "Home Finder management authentication was rejected.",
      { status: 401 },
    );
  }
  if (status === 403) {
    return new HomeFinderAdapterError(
      "forbidden",
      "This Home Finder management read is not authorized.",
      { status: 403 },
    );
  }
  if (status === 404) {
    return new HomeFinderAdapterError(
      "not_found",
      "The Home Finder management resource is unavailable.",
      { status: 404 },
    );
  }
  if (status === 429) {
    return new HomeFinderAdapterError(
      "rate_limited",
      "Home Finder management reads are rate limited.",
      { status: 429, retryable: true },
    );
  }
  return new HomeFinderAdapterError(
    "source_unavailable",
    "Home Finder management data is temporarily unavailable.",
    { status: status >= 500 ? 503 : status, retryable: status >= 500 },
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new HomeFinderAdapterError(
      "schema_mismatch",
      "The Home Finder management response is invalid.",
      { cause },
    );
  }
}

function schemaError(): HomeFinderAdapterError {
  return new HomeFinderAdapterError(
    "schema_mismatch",
    "The Home Finder management response does not match its schema.",
  );
}

function readinessItem(value: unknown): HomeFinderReadinessItem {
  if (!isRecord(value)) throw schemaError();
  const requirement = textValue(value.requirement, 240);
  const state = value.state;
  const source = textValue(value.source, 500);
  const observedAt = isoValue(value.observedAt);
  const responsibleParty = textValue(value.responsibleParty, 240);
  if (
    !requirement ||
    (state !== "confirmed" &&
      state !== "missing" &&
      state !== "unverified" &&
      state !== "stale") ||
    !source ||
    !observedAt ||
    !responsibleParty
  ) {
    throw schemaError();
  }
  return { requirement, state, source, observedAt, responsibleParty };
}

function readinessItems(value: unknown): HomeFinderReadinessItem[] {
  if (!Array.isArray(value) || value.length > 32) throw schemaError();
  return value.map(readinessItem);
}

function parsePreviewHref(
  value: unknown,
  baseUrl: URL,
  installationId: string,
  mode: "demo" | "live",
): string {
  const previewHref = textValue(value, 2_048);
  if (!previewHref) throw schemaError();

  const allowedPaths = new Set([
    "/embed/agency-preview",
    ...(mode === "demo"
      ? [`/embed/${encodeURIComponent(installationId)}`]
      : []),
  ]);
  let parsed: URL;
  try {
    parsed = new URL(previewHref, `${baseUrl.origin}/`);
  } catch {
    throw schemaError();
  }
  if (
    parsed.origin !== baseUrl.origin ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !allowedPaths.has(parsed.pathname)
  ) {
    throw schemaError();
  }
  // A relative href is safe only when it is one of the exact paths above.
  // This rejects protocol-relative, javascript:, and other off-origin forms.
  if (
    !previewHref.startsWith("/") &&
    parsed.toString() !== previewHref
  ) {
    throw schemaError();
  }
  return previewHref;
}

function parseSummary(
  value: unknown,
  baseUrl: URL,
  expectedInstallationId: string,
): HomeFinderInstallationSummary {
  if (!isRecord(value) || value.schemaVersion !== HOME_FINDER_MANAGEMENT_SCHEMA_VERSION) {
    throw schemaError();
  }
  const id = textValue(value.id, 160);
  const brokerageName = textValue(value.brokerageName, 240);
  const observedAt = isoValue(value.observedAt);
  if (
    !id ||
    !brokerageName ||
    (value.mode !== "demo" && value.mode !== "live") ||
    !observedAt
  ) {
    throw schemaError();
  }
  if (id !== expectedInstallationId) throw schemaError();
  const mode = value.mode;
  if (mode !== "demo" && mode !== "live") throw schemaError();
  const previewHref = parsePreviewHref(
    value.previewHref,
    baseUrl,
    expectedInstallationId,
    mode,
  );
  if (value.approvedOrigin !== undefined) {
    const origin = textValue(value.approvedOrigin, 2_048);
    if (!origin) throw schemaError();
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" || parsed.origin !== origin) {
        throw new Error("origin");
      }
    } catch {
      throw schemaError();
    }
  }
  return {
    schemaVersion: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
    id,
    brokerageName,
    mode,
    ...(value.approvedOrigin === undefined
      ? {}
      : { approvedOrigin: value.approvedOrigin as string }),
    previewHref,
    observedAt,
    readiness: readinessItems(value.readiness),
  };
}

function parseReadiness(value: unknown): HomeFinderReadiness {
  if (!isRecord(value) || value.schemaVersion !== HOME_FINDER_MANAGEMENT_SCHEMA_VERSION) {
    throw schemaError();
  }
  const installationId = textValue(value.installationId, 160);
  const observedAt = isoValue(value.observedAt);
  if (!installationId || !observedAt) throw schemaError();
  return {
    schemaVersion: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
    installationId,
    observedAt,
    readiness: readinessItems(value.readiness),
  };
}

function deliverySummary(value: unknown): HomeFinderDeliverySummary {
  if (!isRecord(value)) throw schemaError();
  const reference = textValue(value.reference, MAX_REFERENCE_BYTES);
  const occurredAt = isoValue(value.occurredAt);
  const expiresAt = isoValue(value.expiresAt);
  if (
    !reference ||
    (value.state !== "pending" &&
      value.state !== "delivered" &&
      value.state !== "bounced" &&
      value.state !== "failed") ||
    !occurredAt ||
    !expiresAt
  ) {
    throw schemaError();
  }
  return {
    reference,
    state: value.state,
    occurredAt,
    expiresAt,
  };
}

function parsePage(value: unknown): HomeFinderDeliveryPage {
  if (!isRecord(value) || value.schemaVersion !== HOME_FINDER_MANAGEMENT_SCHEMA_VERSION) {
    throw schemaError();
  }
  const installationId = textValue(value.installationId, 160);
  const observedAt = isoValue(value.observedAt);
  if (!installationId || !observedAt || !Array.isArray(value.items) || value.items.length > MAX_PAGE_SIZE) {
    throw schemaError();
  }
  let nextCursor: string | undefined;
  if (value.nextCursor !== undefined) {
    const parsedCursor = textValue(value.nextCursor, MAX_CURSOR_BYTES);
    if (!parsedCursor) throw schemaError();
    nextCursor = parsedCursor;
  }
  return {
    schemaVersion: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
    installationId,
    observedAt,
    items: value.items.map(deliverySummary),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

function parseDetail(value: unknown): HomeFinderDeliveryDetail {
  if (!isRecord(value) || value.schemaVersion !== HOME_FINDER_MANAGEMENT_SCHEMA_VERSION) {
    throw schemaError();
  }
  const installationId = textValue(value.installationId, 160);
  const observedAt = isoValue(value.observedAt);
  if (!installationId || !observedAt) throw schemaError();
  return {
    schemaVersion: HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
    installationId,
    observedAt,
    ...deliverySummary(value),
  };
}

export type HomeFinderServerAdapter = {
  readInstallationSummary(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderInstallationSummary>;
  readReadiness(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderReadiness>;
  listDeliveryReceipts(
    scope: HomeFinderInstallationScope,
    options?: HomeFinderReceiptListOptions,
  ): Promise<HomeFinderDeliveryPage>;
  readDeliveryReceipt(
    scope: HomeFinderInstallationScope,
    reference: string,
    options?: HomeFinderReadOptions,
  ): Promise<HomeFinderDeliveryDetail>;
};

export function createHomeFinderServerAdapter(
  options: HomeFinderServerAdapterOptions,
): HomeFinderServerAdapter {
  const key = signingKey(options.signingKey);
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "The Home Finder management timeout is invalid.",
    );
  }
  if (
    !Number.isFinite(maxResponseBytes) ||
    maxResponseBytes < 1_024 ||
    maxResponseBytes > 2 * 1024 * 1024
  ) {
    throw new HomeFinderAdapterError(
      "invalid_scope",
      "The Home Finder management response limit is invalid.",
    );
  }

  async function request<T>(input: {
    operation: HomeFinderManagementOperation;
    scope: HomeFinderInstallationScope;
    path: string;
    query?: Record<string, string | undefined>;
    cursor?: string;
    reference?: string;
    correlationId?: string;
    parse: (value: unknown) => T;
    echo: (value: T, installationId: string) => boolean;
  }): Promise<T> {
    const installationId = assertOperation(input.scope, input.operation);
    const correlation = correlationId(input.correlationId);
    const current = now();
    const issuedAt = Math.floor(current.getTime() / 1_000);
    if (!Number.isFinite(issuedAt)) {
      throw new HomeFinderAdapterError(
        "invalid_request",
        "The Home Finder management clock is invalid.",
      );
    }
    const token = credential(
      {
        operation: input.operation,
        installationId,
        correlationId: correlation,
        issuedAt,
        expiresAt: issuedAt + 60,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.reference === undefined ? {} : { reference: input.reference }),
      },
      key,
    );
    const url = makeUrl(baseUrl, input.path, input.query);
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const fetchPromise = Promise.resolve().then(() =>
      fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-store",
          "x-strelva-correlation-id": correlation,
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      }),
    );
    const responsePromise = fetchPromise.then(async (response) => {
      const body = await readResponseBody(response, maxResponseBytes);
      if (!response.ok) throw providerError(response.status);
      const parsed = input.parse(safeJson(body));
      if (!input.echo(parsed, installationId)) {
        throw new HomeFinderAdapterError(
          "schema_mismatch",
          "The Home Finder management response scope does not match the request.",
        );
      }
      return parsed;
    });
    // The race below is authoritative even for a test/destination fetch that
    // does not honor AbortSignal. Avoid an unhandled rejection after timeout.
    void responsePromise.catch(() => undefined);
    try {
      return await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(
              new HomeFinderAdapterError(
                "timeout",
                "The Home Finder management request timed out.",
                { retryable: true },
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof HomeFinderAdapterError) throw error;
      if (error instanceof SyntaxError) throw schemaError();
      throw new HomeFinderAdapterError(
        "source_unavailable",
        "Home Finder management data is temporarily unavailable.",
        { retryable: true, cause: error },
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  return {
    readInstallationSummary(scope, readOptions = {}) {
      return request({
        operation: "readInstallationSummary",
        scope,
        path: `api/v1/management/installations/${encodeURIComponent(
          scopeInstallationId(scope),
        )}`,
        correlationId: readOptions.correlationId,
        parse: (value) =>
          parseSummary(value, baseUrl, scopeInstallationId(scope)),
        echo: (value, installationId) => value.id === installationId,
      });
    },
    readReadiness(scope, readOptions = {}) {
      return request({
        operation: "readReadiness",
        scope,
        path: `api/v1/management/installations/${encodeURIComponent(
          scopeInstallationId(scope),
        )}/readiness`,
        correlationId: readOptions.correlationId,
        parse: parseReadiness,
        echo: (value, installationId) =>
          value.installationId === installationId,
      });
    },
    listDeliveryReceipts(scope, listOptions = {}) {
      const limit = listOptions.limit ?? DEFAULT_PAGE_SIZE;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new HomeFinderAdapterError(
          "invalid_request",
          "Choose a Home Finder receipt page size from 1 to 50.",
          { status: 400 },
        );
      }
      const cursor = listOptions.cursor;
      if (cursor !== undefined && !textValue(cursor, MAX_CURSOR_BYTES)) {
        throw new HomeFinderAdapterError(
          "invalid_request",
          "The Home Finder receipt cursor is invalid.",
          { status: 400 },
        );
      }
      const installationId = scopeInstallationId(scope);
      return request({
        operation: "listDeliveryReceipts",
        scope,
        path: `api/v1/management/installations/${encodeURIComponent(
          installationId,
        )}/receipts`,
        query: {
          ...(cursor === undefined ? {} : { cursor }),
          limit: String(limit),
        },
        cursor,
        correlationId: listOptions.correlationId,
        parse: parsePage,
        echo: (value, expected) => value.installationId === expected,
      });
    },
    readDeliveryReceipt(scope, reference, readOptions = {}) {
      const safeReference = textValue(reference, MAX_REFERENCE_BYTES);
      if (!safeReference) {
        throw new HomeFinderAdapterError(
          "invalid_request",
          "The Home Finder receipt reference is invalid.",
          { status: 400 },
        );
      }
      const installationId = scopeInstallationId(scope);
      return request({
        operation: "readDeliveryReceipt",
        scope,
        path: `api/v1/management/installations/${encodeURIComponent(
          installationId,
        )}/receipts/${encodeURIComponent(safeReference)}`,
        reference: safeReference,
        correlationId: readOptions.correlationId,
        parse: parseDetail,
        echo: (value, expected) =>
          value.installationId === expected && value.reference === safeReference,
      });
    },
  };
}

export {
  HOME_FINDER_MANAGEMENT_OPERATIONS,
  HOME_FINDER_MANAGEMENT_SCHEMA_VERSION,
};
