/**
 * Static `/api/v1` call-site conformance for client repos.
 *
 * Each repo entry in `release-manifest.json` → `customRepoWorkspace.repos[]`
 * declares the v1 endpoints it calls (`v1Endpoints`) and, for each one, the
 * file that makes the call (`v1CallSites`). This module reads that file and
 * proves three things without running the client repo:
 *
 *   1. The call targets the real path shape: after resolving same-file string
 *      constants (`const CONTRACT_VERSION = "v1"`), the source contains
 *      `/api/v1/<endpoint>/`. A hard-coded tenant segment must equal the
 *      manifest tenant.
 *   2. Every declared body field is actually sent by that file
 *      (`{ name, email: x }`, `payload.orderId = …`).
 *   3. Every declared body field is one the platform route reads, and every
 *      field the route requires is declared.
 *
 * The RUNTIME half — the real route handlers executed against each repo's
 * fixture body — is `src/__tests__/custom-repo-v1-contracts.test.ts`, which
 * also proves `V1_ROUTE_CONTRACTS` below matches the route sources.
 *
 * Relative imports only, no `next/*`, so `tsx` and vitest both load it.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export type V1Fixture = {
  name: string;
  body: Record<string, unknown>;
  expectStatus: number;
  expectBody?: Record<string, unknown>;
};

export type V1CallSite = {
  endpoint: string;
  file: string;
  /** `beacon-text` = navigator.sendBeacon with a text/plain Blob. Default `json`. */
  transport?: "json" | "beacon-text";
  /** `spam-pit-write-key` = `Authorization: Bearer $SPAM_PIT_WRITE_KEY`. */
  auth?: "spam-pit-write-key";
  bodyFields?: string[];
  /** How the repo uses the response, in words (fire-and-forget, checks r.ok, …). */
  responseUse?: string;
  fixtures?: V1Fixture[];
};

export type RouteContract = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Nested resources place tenant before the suffix. Defaults to /api/v1/<key>/{tenant}. */
  pathTemplate?: string;
  query?: { reads: string[]; required: string[] };
  /** Documentation of the seam; runtime fixtures assert these semantics. */
  auth?: "public" | "spam-pit-write-key" | "management-token-body" | "signed-preview";
  successStatuses?: number[];
  replay?: "read-only" | "request-id-optional" | "management-token" | "readback-only" | "not-idempotent";
  /** Platform route file, relative to the control-plane checkout. */
  routeFile: string;
  /** Body fields the route reads (write methods only). */
  reads?: string[];
  /** Body fields without which the route rejects the request. */
  required?: string[];
};

/** Consumer-facing v1 contracts. New starter resources do not imply deployed adoption. */
export const V1_ROUTE_CONTRACTS: Record<string, RouteContract> = {
  leads: {
    method: "POST",
    routeFile: "src/app/api/v1/leads/[tenant]/route.ts",
    reads: ["name", "email", "message", "source", "website", "company", "capabilityId", "capabilityVersion", "fields"],
    required: ["name"], auth: "public", successStatuses: [200], replay: "not-idempotent",
  },
  track: {
    method: "POST",
    routeFile: "src/app/api/v1/track/[tenant]/route.ts",
    reads: ["event", "serviceId", "amountCents", "currency", "items", "orderId"],
    required: ["event"], auth: "public", successStatuses: [200], replay: "not-idempotent",
  },
  "spam-pit": {
    method: "POST",
    routeFile: "src/app/api/v1/spam-pit/[tenant]/route.ts",
    reads: ["reason", "source", "name", "email", "message", "fields", "ip", "userAgent"],
    required: [], auth: "spam-pit-write-key", successStatuses: [200], replay: "not-idempotent",
  },
  content: { method: "GET", routeFile: "src/app/api/v1/content/[tenant]/[section]/route.ts", auth: "signed-preview", successStatuses: [200], replay: "read-only" },
  "page-config": { method: "GET", routeFile: "src/app/api/v1/page-config/[tenant]/route.ts", auth: "signed-preview", successStatuses: [200], replay: "read-only" },
  "site-capabilities": { method: "GET", routeFile: "src/app/api/v1/site-capabilities/[tenant]/route.ts", auth: "public", successStatuses: [200], replay: "read-only" },
  inquiries: {
    method: "GET", routeFile: "src/app/api/v1/inquiries/[tenant]/route.ts",
    query: { reads: ["capabilityId"], required: ["capabilityId"] },
    auth: "public", successStatuses: [200], replay: "read-only",
  },
  bookings: {
    method: "GET", routeFile: "src/app/api/v1/bookings/[tenant]/route.ts",
    query: { reads: ["capabilityId", "from", "to"], required: ["capabilityId"] },
    auth: "public", successStatuses: [200], replay: "read-only",
  },
  "bookings-reservations": {
    method: "POST", routeFile: "src/app/api/v1/bookings/[tenant]/reservations/route.ts",
    pathTemplate: "/api/v1/bookings/{tenant}/reservations",
    reads: ["origin", "capabilityId", "capabilityVersion", "slotId", "visitor", "requestId"],
    // Visitor contract. origin=agent uses the separate native assistant schema.
    required: ["capabilityId", "capabilityVersion", "slotId", "visitor"],
    auth: "public", successStatuses: [201], replay: "request-id-optional",
  },
  "bookings-change": {
    method: "PATCH", routeFile: "src/app/api/v1/bookings/[tenant]/reservations/[reservationId]/route.ts",
    pathTemplate: "/api/v1/bookings/{tenant}/reservations/{reservationId}",
    reads: ["managementToken", "capabilityId", "capabilityVersion", "slotId"],
    required: ["managementToken", "capabilityId", "capabilityVersion", "slotId"],
    auth: "management-token-body", successStatuses: [200], replay: "management-token",
  },
  "bookings-cancel": {
    method: "DELETE", routeFile: "src/app/api/v1/bookings/[tenant]/reservations/[reservationId]/route.ts",
    pathTemplate: "/api/v1/bookings/{tenant}/reservations/{reservationId}",
    reads: ["managementToken"], required: ["managementToken"],
    auth: "management-token-body", successStatuses: [200], replay: "management-token",
  },
  "bookings-readback": {
    method: "POST", routeFile: "src/app/api/v1/bookings/[tenant]/reservations/[reservationId]/readback/route.ts",
    pathTemplate: "/api/v1/bookings/{tenant}/reservations/{reservationId}/readback",
    reads: ["managementToken"], required: ["managementToken"],
    auth: "management-token-body", successStatuses: [200], replay: "readback-only",
  },
  collections: {
    method: "GET", routeFile: "src/app/api/v1/collections/[tenant]/[type]/route.ts",
    pathTemplate: "/api/v1/collections/{tenant}/{type}",
    query: { reads: ["preview"], required: [] },
    auth: "signed-preview", successStatuses: [200], replay: "read-only",
  },
  "collections-entry": {
    method: "GET", routeFile: "src/app/api/v1/collections/[tenant]/[type]/[slug]/route.ts",
    pathTemplate: "/api/v1/collections/{tenant}/{type}/{slug}",
    query: { reads: ["preview"], required: [] },
    auth: "signed-preview", successStatuses: [200], replay: "read-only",
  },
};

export type V1CheckResult = { name: string; ok: boolean; detail?: string };

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace `${NAME}` with the value of a same-file `const NAME = "…"`. */
export function resolveStringConstants(source: string): string {
  const constants = new Map<string, string>();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`$]*)["'`]/g)) {
    constants.set(match[1]!, match[2]!);
  }
  return source.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, name: string) => constants.get(name) ?? whole);
}

/** Drop block comments and whole-line `//` comments so a path or field named
 *  only in documentation never counts as a call. (Trailing `//` is kept: it is
 *  indistinguishable from `https://` inside a string without a parser.) */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** True when `field` is sent as an object key (`{ field`, `, field:`) or assigned (`.field =`). */
export function sendsField(source: string, field: string): boolean {
  const f = escape(field);
  return new RegExp(`[{,]\\s*["']?${f}["']?\\s*[:,}]`).test(source) ||
    new RegExp(`\\.${f}\\s*=(?!=)`).test(source);
}

/**
 * Check one repo's call sites against already-loaded sources. Pure, so the
 * vitest suite can drive it with in-memory fixtures.
 */
export function checkV1CallSites(input: {
  tenant: string;
  v1Endpoints: string[];
  callSites: V1CallSite[];
  readSource: (file: string) => string | null;
  platformRoot?: string;
}): V1CheckResult[] {
  const { tenant, v1Endpoints, callSites, readSource } = input;
  const results: V1CheckResult[] = [];
  const push = (name: string, ok: boolean, detail?: string) =>
    results.push({ name: `${tenant}:v1:${name}`, ok, detail: ok ? undefined : detail });

  for (const endpoint of v1Endpoints) {
    const contract = V1_ROUTE_CONTRACTS[endpoint];
    push(`${endpoint}:known-route`, Boolean(contract), `no V1_ROUTE_CONTRACTS entry for "${endpoint}"`);
    if (contract && input.platformRoot) {
      const routePath = path.join(input.platformRoot, contract.routeFile);
      push(`${endpoint}:route-exists`, existsSync(routePath), `platform route missing at ${routePath}`);
    }
    push(
      `${endpoint}:call-site-declared`,
      callSites.some((site) => site.endpoint === endpoint),
      "v1Endpoints lists it but v1CallSites has no evidence file",
    );
  }

  for (const site of callSites) {
    const label = `${site.endpoint}:${site.file}`;
    if (!v1Endpoints.includes(site.endpoint)) {
      push(`${label}:listed`, false, `call site for "${site.endpoint}" is not in v1Endpoints`);
    }
    const contract = V1_ROUTE_CONTRACTS[site.endpoint];
    const raw = readSource(site.file);
    if (raw === null) {
      push(`${label}:file`, false, "call-site file not found");
      continue;
    }
    const source = resolveStringConstants(stripComments(raw));
    const template = contract?.pathTemplate ?? `/api/v1/${site.endpoint}/{tenant}`;
    // Capture tenant only; other segments may be constants or interpolations.
    const segment = '(?:\\$\\{[^}]+\\}|[^\\s"\'`/?]+)';
    const pattern = template.split(/(\{[A-Za-z]+\})/).map(part =>
      part === "{tenant}" ? `(${segment})` : /^\{[A-Za-z]+\}$/.test(part) ? segment : escape(part),
    ).join("");
    const pathPattern = new RegExp(pattern, "g");
    const paths = [...source.matchAll(pathPattern)];
    push(`${label}:path`, paths.length > 0, `no ${template} path in the file`);
    for (const match of paths) {
      const segment = match[1]!;
      const placeholder = /^(\$\{|\{|:|<)/.test(segment);
      if (!placeholder && segment !== tenant) {
        push(`${label}:tenant-segment`, false, `hard-coded tenant "${segment}" but manifest tenant is "${tenant}"`);
      }
    }

    if (!contract || contract.method === "GET") continue;
    const fields = site.bodyFields ?? [];
    const missing = fields.filter((field) => !sendsField(source, field));
    push(`${label}:body-fields-sent`, missing.length === 0, `declared but not sent by the file: ${missing.join(", ")}`);
    const unread = fields.filter((field) => !(contract.reads ?? []).includes(field));
    push(`${label}:body-fields-read`, unread.length === 0, `sent but not read by the platform route: ${unread.join(", ")}`);
    const absent = (contract.required ?? []).filter((field) => !fields.includes(field));
    push(`${label}:required-fields`, absent.length === 0, `platform route requires: ${absent.join(", ")}`);
    for (const fixture of site.fixtures ?? []) {
      const extra = Object.keys(fixture.body).filter((key) => !fields.includes(key));
      push(
        `${label}:fixture:${fixture.name}`,
        extra.length === 0,
        `fixture sends fields the repo does not: ${extra.join(", ")}`,
      );
    }
  }
  return results;
}
