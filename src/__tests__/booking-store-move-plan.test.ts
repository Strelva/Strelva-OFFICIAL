import { describe, expect, it, vi } from "vitest";
import { parseBookingMoveArgs, runBookingMove, type BookingMoveDeps } from "../../scripts/booking-store-move-plan";

// scripts/booking-store-move.ts: production reads and writes need Jacob's yes.

function deps(): BookingMoveDeps & { backfill: ReturnType<typeof vi.fn>; parity: ReturnType<typeof vi.fn> } {
  return {
    tenants: async () => ["twintrees-a", "gldf"],
    backfill: vi.fn(async (tenant: string, apply: boolean) => ({
      tenant, apply, legacyBookings: 2, reservations: 0, written: apply ? 2 : 0, unchanged: 0, conflicts: [], failed: [], settings: apply ? "written" as const : "would_write" as const,
      notes: ["requirePayment was on: payments are not carried into the one store."],
    })),
    parity: vi.fn(async (tenant: string) => ({ tenant, ok: tenant !== "gldf", legacyCount: 2, storeCount: 2, missing: [], mismatched: [], slotDifferences: [], slotDifferencesExplained: false, recorded: true })),
    log: vi.fn(),
  };
}

const LOCAL = "http://127.0.0.1:54321";
const PROD = "https://abcd.supabase.co";

describe("booking store move", () => {
  it("parses commands and refuses unknown flags", () => {
    expect(parseBookingMoveArgs(["backfill", "gldf", "--apply"])).toMatchObject({ command: "backfill", tenant: "gldf", apply: true, jacobsYes: false });
    expect(() => parseBookingMoveArgs(["move"])).toThrow("Usage");
    expect(() => parseBookingMoveArgs(["backfill", "--force"])).toThrow("Unknown option");
    expect(() => parseBookingMoveArgs(["parity", "--apply"])).toThrow("no --apply");
  });

  it("a local dry run reads and writes nothing; apply writes; both report notes", async () => {
    const d = deps();
    const dry = await runBookingMove({ ...parseBookingMoveArgs(["backfill"]), databaseUrl: LOCAL }, d);
    expect(dry).toMatchObject({ apply: false, database: "local", totals: { legacyBookings: 4, written: 0 } });
    expect(d.backfill).toHaveBeenCalledWith("twintrees-a", false);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("note twintrees-a: requirePayment"));
    const applied = await runBookingMove({ ...parseBookingMoveArgs(["backfill", "--apply"]), databaseUrl: LOCAL }, d);
    expect(applied.totals).toMatchObject({ written: 4 });
  });

  it("refuses production without Jacob's yes: apply, dry run and parity", async () => {
    await expect(runBookingMove({ ...parseBookingMoveArgs(["backfill", "--apply"]), databaseUrl: PROD }, deps())).rejects.toThrow("Jacob's yes");
    await expect(runBookingMove({ ...parseBookingMoveArgs(["backfill"]), databaseUrl: PROD }, deps())).rejects.toThrow("Jacob's yes");
    await expect(runBookingMove({ ...parseBookingMoveArgs(["parity"]), databaseUrl: PROD }, deps())).rejects.toThrow("Jacob's yes");
    await expect(runBookingMove({ ...parseBookingMoveArgs(["backfill", "--apply"]) }, deps())).rejects.toThrow("no database");
    const d = deps();
    const allowed = await runBookingMove({ ...parseBookingMoveArgs(["backfill", "--apply", "--i-have-jacobs-yes"]), databaseUrl: PROD }, d);
    expect(allowed.database).toBe("not local");
  });

  it("parity counts tenants out of parity", async () => {
    const outcome = await runBookingMove({ ...parseBookingMoveArgs(["parity"]), databaseUrl: LOCAL }, deps());
    expect(outcome.totals.outOfParity).toBe(1);
  });
});
