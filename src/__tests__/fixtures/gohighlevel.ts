/**
 * Fabricated HighLevel responses, shaped from the official OpenAPI specs
 * (https://github.com/GoHighLevel/highlevel-api-docs apps/locations.json
 * GetLocationSchema, apps/users.json UserSchema/RoleSchema, apps/oauth.json
 * GetAccessCodeSuccessfulResponseDto). No value here came from a real account.
 */

export const GHL_COMPANY_ID = "cmpFixture0000000001";

export function ghlLocation(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `loc${String(index).padStart(5, "0")}`,
    name: `Fixture Client ${String(index).padStart(3, "0")}`,
    phone: "+1 716-555-0100",
    email: `front-desk-${index}@client.example.test`,
    address: "1 Main St",
    city: "Buffalo",
    state: "NY",
    country: "US",
    postalCode: "14202",
    website: `client${index}.example.test`,
    timezone: "America/New_York",
    settings: {},
    social: {},
    ...overrides,
  };
}

export function ghlUser(id: string, email: string, roles: { type: "agency" | "account"; role: "admin" | "user"; locationIds: string[] }, extra: Record<string, unknown> = {}) {
  return { id, name: `${id} Person`, firstName: id, lastName: "Person", email, phone: "", deleted: false, roles, permissions: {}, scopes: [], ...extra };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export const ghlCompanyTokenResponse = {
  access_token: "fixture-agency-access",
  token_type: "Bearer",
  expires_in: 86399,
  refresh_token: "fixture-agency-refresh",
  scope: "locations.readonly users.readonly oauth.readonly",
  userType: "Company",
  companyId: GHL_COMPANY_ID,
  userId: "usrFixtureInstaller01",
  isBulkInstallation: true,
  approveAllLocations: true,
  installToFutureLocations: true,
};
