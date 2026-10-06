import { describe, expect, it, vi } from "vitest";
import { assertCountTargetAllowed, parseCountArgs } from "../../scripts/count-client-redis-keys";
import {
  assertBackfillTargetsAllowed,
  parseBackfillArgs,
  runSecretBackfill,
  type BackfillDeps,
  type TenantSecretRow,
} from "../../scripts/backfill-secret-encryption";
import { assertFlagTargetAllowed, parseFlagArgs, runFlagCommand } from "../../scripts/workspace-release-flag";
import type { Connection } from "@/lib/types";

const PROD_REDIS = "https://example-123.upstash.io";
const PROD_DB = "https://abc.supabase.co";

describe("count-client-redis-keys guard", () => {
  it("allows a local Redis without a yes", () => {
    expect(assertCountTargetAllowed("http://localhost:8079", parseCountArgs([]))).toBe("local");
    expect(assertCountTargetAllowed("http://redis.localhost:8079", parseCountArgs(["--json"]))).toBe("local");
  });
  it("refuses a non-local Redis without --i-have-jacobs-yes", () => {
    expect(() => assertCountTargetAllowed(PROD_REDIS, parseCountArgs([]))).toThrow(/--i-have-jacobs-yes/);
    expect(assertCountTargetAllowed(PROD_REDIS, parseCountArgs(["--i-have-jacobs-yes"]))).toBe("not local");
  });
  it("refuses a missing or unparsable URL and unknown flags", () => {
    expect(() => assertCountTargetAllowed(undefined, parseCountArgs(["--i-have-jacobs-yes"]))).toThrow(/not configured/);
    expect(() => assertCountTargetAllowed("not a url", parseCountArgs([]))).toThrow(/not a local/);
    expect(() => parseCountArgs(["--yes"])).toThrow(/Unknown/);
  });
});

describe("backfill-secret-encryption guard", () => {
  const key = { SECRETS_ENC_KEY: "k" };
  it("defaults to a dry run and rejects conflicting or unknown flags", () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, jacobsYes: false });
    expect(parseBackfillArgs(["--apply", "--i-have-jacobs-yes"])).toEqual({ apply: true, jacobsYes: true });
    expect(() => parseBackfillArgs(["--apply", "--dry-run"])).toThrow(/not both/);
    expect(() => parseBackfillArgs(["--force"])).toThrow(/Unknown/);
  });
  it("refuses without SECRETS_ENC_KEY", () => {
    expect(() => assertBackfillTargetsAllowed({ SUPABASE_URL: "http://127.0.0.1:54321" }, parseBackfillArgs(["--apply"]))).toThrow(/SECRETS_ENC_KEY/);
  });
  it("allows local targets with no yes, for dry run and apply", () => {
    const env = { ...key, SUPABASE_URL: "http://127.0.0.1:54321", UPSTASH_REDIS_REST_URL: "http://localhost:8079" };
    expect(() => assertBackfillTargetsAllowed(env, parseBackfillArgs([]))).not.toThrow();
    expect(() => assertBackfillTargetsAllowed(env, parseBackfillArgs(["--apply"]))).not.toThrow();
  });
  it("refuses any non-local target without a yes, dry run included", () => {
    expect(() => assertBackfillTargetsAllowed({ ...key, SUPABASE_URL: PROD_DB }, parseBackfillArgs([]))).toThrow(/SUPABASE_URL is not a local/);
    expect(() => assertBackfillTargetsAllowed({ ...key, SUPABASE_URL: "http://localhost:54321", UPSTASH_REDIS_REST_URL: PROD_REDIS }, parseBackfillArgs(["--apply"]))).toThrow(/UPSTASH_REDIS_REST_URL is not/);
    expect(() => assertBackfillTargetsAllowed({ ...key, SUPABASE_URL: PROD_DB, UPSTASH_REDIS_REST_URL: PROD_REDIS }, parseBackfillArgs(["--apply", "--i-have-jacobs-yes"]))).not.toThrow();
  });
});

describe("runSecretBackfill", () => {
  function fakes() {
    const rows: TenantSecretRow[] = [
      { id: "t-plain", slack_webhook_url: "https://hooks.example/abc", google_search_console_key: null, instagram_access_token: "enc:v1:x", revalidation_secret: "" },
      { id: "t-clean", slack_webhook_url: null, google_search_console_key: "enc:v1:y", instagram_access_token: null, revalidation_secret: null },
    ];
    const store: Record<string, Connection> = {
      "connections:a:google": { accessToken: "plain-token", refreshToken: "enc:v1:r" } as unknown as Connection,
      "connections:b:google": { accessToken: "enc:v1:a" } as unknown as Connection,
    };
    const update = vi.fn(async () => {});
    const save = vi.fn(async () => {});
    const lines: string[] = [];
    const deps: BackfillDeps = {
      encryptSecret: (v) => (v && !v.startsWith("enc:v1:") ? `enc:v1:${v.length}` : v),
      tenants: { list: async () => rows, update },
      connections: {
        async *keys() { yield* Object.keys(store); yield "connections:gone"; },
        readRaw: async (k) => store[k] ?? null,
        save,
      },
      log: (line) => lines.push(line),
    };
    return { deps, update, save, lines };
  }

  it("dry run writes nothing and never prints a secret value", async () => {
    const { deps, update, save, lines } = fakes();
    const outcome = await runSecretBackfill(parseBackfillArgs([]), deps);
    expect(outcome).toEqual({ mode: "dry-run", tenants: { total: 2, needsWork: 1, updated: 0 }, connections: { scanned: 3, needsWork: 1, updated: 0 } });
    expect(update).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    const output = lines.join("\n");
    expect(output).toContain("t-plain — slack_webhook_url");
    expect(output).toContain("connections:a:google — accessToken");
    expect(output).not.toContain("hooks.example");
    expect(output).not.toContain("plain-token");
    expect(output).toContain("nothing was written");
  });

  it("apply encrypts only plaintext columns and connections", async () => {
    const { deps, update, save } = fakes();
    const outcome = await runSecretBackfill(parseBackfillArgs(["--apply"]), deps);
    expect(outcome.tenants.updated).toBe(1);
    expect(outcome.connections.updated).toBe(1);
    expect(update).toHaveBeenCalledWith("t-plain", { slack_webhook_url: "enc:v1:25" });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("skips unconfigured stores", async () => {
    const lines: string[] = [];
    const outcome = await runSecretBackfill(parseBackfillArgs([]), { encryptSecret: (v) => v, tenants: null, connections: null, log: (l) => lines.push(l) });
    expect(outcome.tenants.total).toBe(0);
    expect(lines.join("\n")).toMatch(/skipping tenants[\s\S]*skipping connections/);
  });
});

describe("workspace-release-flag script", () => {
  const WS = "7e000000-0000-4000-8000-000000000010";
  const base = [WS, "systems", "on", "--operator-email=ops@example.test", "--reason=Agency library walk-through"];

  it("parses a command and defaults to a dry run", () => {
    expect(parseFlagArgs(base)).toMatchObject({ workspaceId: WS, flag: "systems", state: "on", apply: false, jacobsYes: false });
    expect(() => parseFlagArgs([WS, "ask", "on", "--operator-email=a@b.test", "--reason=why"])).toThrow(/Flag must be/);
    expect(() => parseFlagArgs([WS, "systems", "maybe", "--operator-email=a@b.test", "--reason=why"])).toThrow(/State must be/);
    expect(() => parseFlagArgs(["not-a-uuid", "systems", "on", "--operator-email=a@b.test", "--reason=why"])).toThrow(/workspace id/);
    expect(() => parseFlagArgs([WS, "systems", "on", "--reason=why"])).toThrow(/operator-email/);
    expect(() => parseFlagArgs([...base, "--force"])).toThrow(/Unknown/);
  });

  it("refuses a non-local database without a yes, dry run included", () => {
    expect(() => assertFlagTargetAllowed("http://127.0.0.1:54321", parseFlagArgs(base))).not.toThrow();
    expect(() => assertFlagTargetAllowed(PROD_DB, parseFlagArgs(base))).toThrow(/--i-have-jacobs-yes/);
    expect(() => assertFlagTargetAllowed(PROD_DB, parseFlagArgs([...base, "--i-have-jacobs-yes"]))).not.toThrow();
    expect(() => assertFlagTargetAllowed(undefined, parseFlagArgs(base))).toThrow(/not configured/);
  });

  it("dry run reads only; apply writes with the current revision", async () => {
    const set = vi.fn(async () => ({ flags: { systems: { state: "on", revision: 3 } } }));
    const read = vi.fn(async () => ({ flags: { systems: { state: "operators", revision: 2 } } }));
    expect(await runFlagCommand(parseFlagArgs(base), { read, set })).toEqual({ mode: "dry-run", from: "operators", to: "on" });
    expect(set).not.toHaveBeenCalled();
    expect(await runFlagCommand(parseFlagArgs([...base, "--apply"]), { read, set })).toEqual({ mode: "apply", from: "operators", to: "on" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, flag: "systems", state: "on", expectedRevision: 2 }));
  });
});
