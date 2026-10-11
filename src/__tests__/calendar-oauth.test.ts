import { describe, expect, it, vi } from "vitest";
import { calendarOAuthConfiguration, consumeCalendarOAuthState, createCalendarOAuthState, exchangeCalendarOAuthCode, refreshCalendarOAuthToken } from "@/products/scheduling/calendar/oauth";

describe("workspace calendar OAuth", () => {
  it("binds OAuth state to the workspace, actor and provider", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "calendar-oauth-test-secret");
    const state = createCalendarOAuthState({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", provider: "outlook" }, 1_000);
    expect(await consumeCalendarOAuthState(state, 1_500)).toMatchObject({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", provider: "outlook" });
    const [body] = state.split(".");
    expect(await consumeCalendarOAuthState(`${body}.tampered`, 1_500)).toBeNull();
    expect(await consumeCalendarOAuthState(state, 11 * 60 * 1000)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("builds provider-specific authorization scopes without a tenant binding", () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "outlook-client");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "google-calendar-client");
    expect(calendarOAuthConfiguration("outlook", "https://workspace.example.test")?.scopes).toContain("Calendars.ReadWrite");
    expect(calendarOAuthConfiguration("google", "https://workspace.example.test")?.scopes).toEqual(["https://www.googleapis.com/auth/calendar"]);
    vi.unstubAllEnvs();
  });

  it("exchanges fixture authorization codes at the provider boundary", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "outlook-client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "outlook-secret");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, scope: "openid Calendars.ReadWrite" }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await exchangeCalendarOAuthCode("outlook", "fixture-code", "https://workspace.example.test/callback", fetcher);
    expect(result).toMatchObject({ accessToken: "fixture-access", refreshToken: "fixture-refresh", scopes: ["openid", "Calendars.ReadWrite"] });
    expect(String((fetcher.mock.calls[0]?.[1] as RequestInit).body)).toContain("grant_type=authorization_code");
    vi.unstubAllEnvs();
  });

  it("refreshes Outlook credentials and accepts a rotated refresh token", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "outlook-client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "outlook-secret");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ access_token: "fixture-access-2", refresh_token: "fixture-refresh-2", expires_in: 3600, scope: "Calendars.ReadWrite" }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await refreshCalendarOAuthToken("outlook", "fixture-refresh-1", fetcher);
    expect(result).toMatchObject({ accessToken: "fixture-access-2", refreshToken: "fixture-refresh-2", scopes: ["Calendars.ReadWrite"] });
    const body = new URLSearchParams(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("fixture-refresh-1");
    vi.unstubAllEnvs();
  });

  it("does not attempt a refresh for missing or revoked authorization", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "google-secret");
    const fetcher = vi.fn();
    await expect(refreshCalendarOAuthToken("google", "", fetcher)).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetcher).not.toHaveBeenCalled();
    const revoked = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } }));
    await expect(refreshCalendarOAuthToken("google", "revoked-refresh", revoked)).rejects.toMatchObject({ code: "unauthorized", message: "Calendar authorization has expired. Reconnect the calendar." });
    vi.unstubAllEnvs();
  });

  it("keeps a transient token endpoint failure retryable", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "google-secret");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503, headers: { "content-type": "application/json" } }));
    await expect(refreshCalendarOAuthToken("google", "fixture-refresh", fetcher)).rejects.toMatchObject({ code: "timeout", retryable: true, message: "Calendar token refresh could not be completed. Retry after checking the connection." });
    vi.unstubAllEnvs();
  });
});


describe("booking calendar least privilege and disconnect", () => {
  it("keeps scopes unchanged off and uses only event/busy/list scopes when enabled", async () => {
    const { calendarOAuthConfiguration } = await import("@/products/scheduling/calendar/oauth");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID","fixture-client");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_SCOPES","0");
    expect(calendarOAuthConfiguration("google","https://app.example")?.scopes).toEqual(["https://www.googleapis.com/auth/calendar"]);
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_SCOPES","1");
    expect(calendarOAuthConfiguration("google","https://app.example")?.scopes).toEqual(["https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/calendar.events.freebusy","https://www.googleapis.com/auth/calendar.calendarlist.readonly"]);
    vi.unstubAllEnvs();
  });
  it("revokes Google consent and surfaces rejection without using Microsoft's account-wide revocation", async () => {
    const { revokeCalendarOAuthToken } = await import("@/products/scheduling/calendar/oauth");
    const fetcher = vi.fn(async () => new Response(null,{status:200}));
    await revokeCalendarOAuthToken("google","fixture-token",fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke",expect.objectContaining({method:"POST",body:"token=fixture-token"}));
    fetcher.mockResolvedValueOnce(new Response(null,{status:503}));
    await expect(revokeCalendarOAuthToken("google","fixture-token",fetcher)).rejects.toMatchObject({code:"provider"});
    fetcher.mockClear(); await revokeCalendarOAuthToken("outlook","fixture-token",fetcher); expect(fetcher).not.toHaveBeenCalled();
  });
});
