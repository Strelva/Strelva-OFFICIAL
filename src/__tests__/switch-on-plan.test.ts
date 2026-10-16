/** The production switch-on plan (scripts/release-safety/switch-on.json) keeps Jacob's Oct 15-16 calls. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import plan from "../../scripts/release-safety/switch-on.json";
import manifest from "../../scripts/release-safety/batches.json";
import { scanEnvNames } from "../../scripts/prod-flag-report";
import { RELEASE_FLAG_ENV } from "@/platform/release-flags/resolve";
import { ownerEmailSince, ownerEmailStreamOn } from "@/platform/infra/email/owner-streams";

type Change = { name: string; from: string; to: string; rollback: string; requires: string[] };
const changes = plan.phases.flatMap(phase => phase.changes as Change[]);
const byName = new Map(plan.flags.map(flag => [flag.name, flag]));

describe("switch-on plan", () => {
  it("never turns on what Jacob kept off", () => {
    for (const name of ["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED", "STRELVA_BOOKING_OWNER_NOTICE", "STRELVA_BOOKING_REMINDERS", "STRELVA_INQUIRY_OWNER_NOTICES",
      "STRELVA_NEWSLETTER_SENDER_RELEASE", "STRELVA_VERTICAL_INTAKE_RELEASE", "STRELVA_INTAKE_SENSITIVE_FIELDS", "STRELVA_GOOGLE_MAKE_REAL_RELEASE", "STRELVA_LISTINGS_SYNC_GOOGLE_FIX",
      "STRELVA_GHL_IMPORT_RELEASE", "STRELVA_SELF_SERVE_BILLING", "STRELVA_WORKSPACE_PRICE_ID", "STRELVA_CONNECT", "STRELVA_AGENCY_PAY_LINKS"]) {
      expect(plan.mustStayUnset).toContain(name);
    }
    const changed = new Set(changes.map(change => change.name));
    for (const name of [...plan.mustStayUnset, ...plan.mustStayAsIs]) expect(changed.has(name)).toBe(false);
  });

  it("opens exactly the claim and Needs you streams, and only in the last deploy", () => {
    const streams = changes.find(change => change.name === "STRELVA_OWNER_EMAIL_STREAMS")!;
    const env = { STRELVA_OWNER_EMAIL_STREAMS: streams.to };
    expect(ownerEmailStreamOn("owner_claim", env)).toBe(true);
    expect(ownerEmailStreamOn("needs_you", env)).toBe(true);
    expect(ownerEmailStreamOn("needs_you_reminders", env)).toBe(false);
    const last = plan.phases.at(-1)!;
    expect(last.deploy).toBe(2);
    expect(plan.phases.slice(0, -1).every(phase => phase.deploy === 1)).toBe(true);
    for (const change of changes.filter(item => byName.get(item.name)!.class === "EMAIL_ON")) {
      expect(last.changes.map(item => item.name)).toContain(change.name);
      expect(change.requires).toContain("20261028120000_owner_email_confirmations.sql");
    }
    // The switch time is a placeholder the cutover fills in; as written it turns nothing on.
    expect(ownerEmailSince({ STRELVA_OWNER_EMAIL_SINCE: changes.find(change => change.name === "STRELVA_OWNER_EMAIL_SINCE")!.to })).toBeNull();
  });

  it("gives every change a rollback and a migration that exists and is registered", () => {
    const registered = new Set(JSON.stringify(manifest).match(/\d{14}_[a-z0-9_]+\.sql/g));
    for (const change of changes) {
      expect(typeof change.rollback).toBe("string");
      expect(change.to).toBeTruthy();
      for (const migration of change.requires) {
        expect(existsSync(`supabase/migrations/${migration}`)).toBe(true);
        expect(registered.has(migration)).toBe(true);
      }
    }
  });

  it("names only variables the source actually reads, in a file that reads them", () => {
    const read = new Set([...scanEnvNames(process.cwd()), ...Object.values(RELEASE_FLAG_ENV)]);
    for (const flag of plan.flags) {
      // The line drifts as files change; the file must still mention the name.
      const [file] = flag.where!.split(":");
      const text = readFileSync(file!, "utf8");
      expect(text, flag.name).toContain(flag.name);
      if (!flag.name.startsWith("STRELVA_CONNECTION_APPROVAL_")) expect(read.has(flag.name) || text.includes(`.${flag.name}`) || text.includes(`"${flag.name}"`), flag.name).toBe(true);
    }
  });

  it("never names an owner address in the plan", () => {
    expect(JSON.stringify(plan)).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
  });
});
