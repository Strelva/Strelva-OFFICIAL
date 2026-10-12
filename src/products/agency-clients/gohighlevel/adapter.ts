import { z } from "zod";
import {
  clientImportOwnerCandidateSchema,
  clientImportRowSchema,
  type ClientImportOwnerCandidate,
  type ClientImportRow,
  type ClientImportSourceAdapter,
} from "../import-contract";
import { GHL_MESSAGES, GhlApiError, type GhlClient } from "./client";

/**
 * GoHighLevel sub-accounts as Import clients rows. One row per sub-account
 * (HighLevel "location"); `sourceRef` is the location id, so importing the
 * same agency twice never offers a second client for one sub-account.
 *
 * Reads, with the agency (Company) token only:
 * - GET /locations/search?companyId&skip&limit (scope locations.readonly).
 *   Response `locations[]` with id, name, phone, email, address, city, state,
 *   country, postalCode, website (apps/locations.json GetLocationSchema).
 * - GET /users/search?companyId&skip&limit (scope users.readonly). Response
 *   `users[]` with email, name, deleted and `roles` {type: "agency"|"account",
 *   role: "admin"|"user", locationIds[]}, plus `count` (apps/users.json).
 *
 * No Location token is minted: every read above accepts an Agency token per
 * the spec's security block. UNVERIFIED until a sandbox install: the largest
 * `limit` HighLevel honours (we ask 100 and advance by what comes back), and
 * whether a company-wide user search includes sub-account users. If it returns
 * no sub-account users at all, we fall back to one search per sub-account.
 */

const PAGE_SIZE = 100;
/** Ten thousand sub-accounts is far past any agency we expect; stop there rather than loop forever. */
const MAX_PAGES = 100;

const ghlLocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  postalCode: z.string().nullish(),
  website: z.string().nullish(),
}).passthrough();
export type GhlLocation = z.infer<typeof ghlLocationSchema>;

const ghlUserSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  email: z.string().nullish(),
  deleted: z.boolean().nullish(),
  roles: z.object({
    type: z.string().nullish(),
    role: z.string().nullish(),
    locationIds: z.array(z.string()).nullish(),
  }).passthrough().nullish(),
}).passthrough();
export type GhlUser = z.infer<typeof ghlUserSchema>;

const locationsPageSchema = z.object({ locations: z.array(z.unknown()).default([]) }).passthrough();
const usersPageSchema = z.object({ users: z.array(z.unknown()).default([]), count: z.coerce.number().optional() }).passthrough();

function parsePage<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new GhlApiError(GHL_MESSAGES.malformed, "malformed");
  return parsed.data;
}

/** Every sub-account of the agency, paging until HighLevel returns an empty or already-seen page. */
export async function listGhlSubAccounts(client: GhlClient, companyId: string): Promise<GhlLocation[]> {
  const byId = new Map<string, GhlLocation>();
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = parsePage(locationsPageSchema, await client.get("/locations/search", { companyId, skip: String(skip), limit: String(PAGE_SIZE), order: "asc" }, companyId));
    const locations = body.locations.map((raw) => ghlLocationSchema.safeParse(raw)).filter((r) => r.success).map((r) => r.data);
    const fresh = locations.filter((location) => !byId.has(location.id));
    for (const location of fresh) byId.set(location.id, location);
    if (body.locations.length === 0 || fresh.length === 0) break;
    skip += body.locations.length;
  }
  return [...byId.values()];
}

async function searchUsers(client: GhlClient, companyId: string, locationId?: string): Promise<GhlUser[]> {
  const users: GhlUser[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = parsePage(usersPageSchema, await client.get("/users/search", { companyId, locationId, skip: String(skip), limit: String(PAGE_SIZE) }, companyId));
    for (const raw of body.users) {
      const parsed = ghlUserSchema.safeParse(raw);
      if (parsed.success) users.push(parsed.data);
    }
    skip += body.users.length;
    if (body.users.length === 0 || (body.count !== undefined && skip >= body.count)) break;
  }
  return users;
}

const isAccountUser = (user: GhlUser) => user.deleted !== true && (user.roles?.type ?? "").toLowerCase() === "account";

/**
 * The people on each sub-account's own team (HighLevel role type "account"),
 * keyed by location id. Agency staff (role type "agency") are never owner
 * candidates: they work for the agency, not the client.
 */
export async function listGhlSubAccountUsers(client: GhlClient, companyId: string, locationIds: string[]): Promise<Map<string, GhlUser[]>> {
  const byLocation = new Map<string, GhlUser[]>(locationIds.map((id) => [id, []]));
  const companyUsers = (await searchUsers(client, companyId)).filter(isAccountUser);
  if (companyUsers.length > 0) {
    for (const user of companyUsers) {
      for (const locationId of user.roles?.locationIds ?? []) byLocation.get(locationId)?.push(user);
    }
    return byLocation;
  }
  // Fallback when the company-wide search carries no sub-account users.
  for (const locationId of locationIds) {
    const users = (await searchUsers(client, companyId, locationId)).filter(isAccountUser);
    byLocation.set(locationId, users.filter((user) => !user.roles?.locationIds?.length || user.roles.locationIds.includes(locationId)));
  }
  return byLocation;
}

function clean(value: string | null | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max).trim() : undefined;
}

function website(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 4 || /\s/.test(trimmed)) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : trimmed.includes(".") ? `https://${trimmed}` : null;
  return withScheme && withScheme.length <= 2048 ? withScheme : undefined;
}

function address(location: GhlLocation): string | undefined {
  const region = [clean(location.state, 80), clean(location.postalCode, 20)].filter(Boolean).join(" ");
  const parts = [clean(location.address, 200), clean(location.city, 80), region || undefined, clean(location.country, 60)].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 300) : undefined;
}

function personName(user: GhlUser): string | undefined {
  return clean(user.name, 120) ?? clean([user.firstName, user.lastName].filter(Boolean).join(" "), 120);
}

/**
 * Owner candidates for one sub-account, most likely first: its admins, then
 * its other users, then the business's own contact address. Deduplicated by
 * address; anything that isn't a valid email is dropped.
 */
export function ghlOwnerCandidates(location: GhlLocation, users: GhlUser[]): ClientImportOwnerCandidate[] {
  const seen = new Set<string>();
  const candidates: ClientImportOwnerCandidate[] = [];
  const add = (email: string | null | undefined, basis: ClientImportOwnerCandidate["basis"], name?: string) => {
    const parsed = clientImportOwnerCandidateSchema.safeParse({ email: email ?? "", basis, ...(name ? { name } : {}) });
    if (!parsed.success || seen.has(parsed.data.email) || candidates.length >= 20) return;
    seen.add(parsed.data.email);
    candidates.push(parsed.data);
  };
  const isAdmin = (user: GhlUser) => (user.roles?.role ?? "").toLowerCase() === "admin";
  for (const user of users.filter(isAdmin)) add(user.email, "account_admin", personName(user));
  for (const user of users.filter((user) => !isAdmin(user))) add(user.email, "account_user", personName(user));
  add(location.email, "business_email");
  return candidates;
}

/**
 * One sub-account as a row. `ownerEmail` is filled only when the sub-account
 * has exactly one admin; otherwise it stays empty and `ownerEmailCandidates`
 * lets the agency pick in the preview. A business contact address alone never
 * becomes `ownerEmail`.
 */
export function ghlLocationToRow(location: GhlLocation, users: GhlUser[]): ClientImportRow {
  const candidates = ghlOwnerCandidates(location, users);
  const admins = candidates.filter((candidate) => candidate.basis === "account_admin");
  const row = {
    sourceRef: location.id,
    name: clean(location.name, 120),
    url: website(location.website),
    ownerEmail: admins.length === 1 ? admins[0]!.email : undefined,
    phone: clean(location.phone, 40),
    address: address(location),
    ownerEmailCandidates: candidates.length ? candidates : undefined,
  };
  const defined = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
  return clientImportRowSchema.parse(defined);
}

/** Everything the adapter needs for one agency: its HighLevel client and company id. */
export interface GhlAgencySource {
  client: GhlClient;
  companyId: string;
}

export const ghlReadInputSchema = z.object({ agencyWorkspaceId: z.string().uuid() }).strict();

/**
 * The GoHighLevel Import clients source. `readRows({ agencyWorkspaceId })`
 * lists the agency's sub-accounts and returns one row each, sorted by name.
 * Reading never adds a client; L2's preview and apply do that, one confirmed
 * row at a time through the ordinary add.
 */
export function createGoHighLevelImportAdapter(sourceFor: (agencyWorkspaceId: string) => Promise<GhlAgencySource>): ClientImportSourceAdapter {
  return {
    source: "gohighlevel",
    async readRows(input: unknown): Promise<ClientImportRow[]> {
      const { agencyWorkspaceId } = ghlReadInputSchema.parse(input);
      const { client, companyId } = await sourceFor(agencyWorkspaceId);
      const locations = await listGhlSubAccounts(client, companyId);
      if (locations.length === 0) return [];
      const users = await listGhlSubAccountUsers(client, companyId, locations.map((location) => location.id));
      return locations
        .map((location) => ghlLocationToRow(location, users.get(location.id) ?? []))
        .sort((a, b) => (a.name ?? a.sourceRef).localeCompare(b.name ?? b.sourceRef));
    },
  };
}
