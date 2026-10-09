import { describe, expect, it } from "vitest";
import { cleanupConnectionArgs, cleanupProcessEnvironment } from "./support/tenant-cleanup-postgres";
const args = (...extra: string[]) => JSON.stringify(["-h", "localhost", "-U", "postgres", "-d", "strelva_test", ...extra]);
describe("cleanup proof connection authority", () => {
  it.each([["-h", "remote.example"], ["--host", "remote.example"], ["--host=remote.example"], ["-d", "postgresql://remote.example/db"], ["service=remote"], ["-c", "select 1"], ["-f", "/tmp/commands.sql"]])("refuses appended or duplicate connection switches %j", (...extra) => {
    expect(() => cleanupConnectionArgs(args(...extra))).toThrow();
  });
  it.each(["remote.example", "/tmp/owned/../outside", "postgresql://remote.example/db", "127.0.0.2"])("refuses nonlocal or ambiguous host %s", host => {
    expect(() => cleanupConnectionArgs(JSON.stringify(["-h", host, "-U", "postgres", "-d", "strelva_test"]))).toThrow();
  });
  it("reconstructs only one explicit local host, identity, database and optional valid port", () => {
    expect(cleanupConnectionArgs(args("-p", "5433"))).toEqual(["-h", "localhost", "-p", "5433", "-U", "postgres", "-d", "strelva_test"]);
    expect(cleanupConnectionArgs(JSON.stringify(["-h", "/tmp/owned-socket", "-U", "postgres", "-d", "strelva_test"]))).toContain("/tmp/owned-socket");
    expect(() => cleanupConnectionArgs(args("-p", "65536"))).toThrow();
    expect(() => cleanupConnectionArgs(JSON.stringify(["-h", "localhost", "-d", "strelva_test"]))).toThrow();
  });
  it("strips service, host-address, options and all other libpq/psql environment overrides", () => {
    expect(cleanupProcessEnvironment({ PATH: "/owned/bin", PGHOSTADDR: "remote", PGSERVICE: "remote", PGOPTIONS: "override", PGPASSWORD: "fixture", PSQLRC: "/tmp/commands", HOME: "/owned" })).toEqual({ PATH: "/owned/bin", HOME: "/owned" });
  });
});
