import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startRetainedNativeChild } from "../../scripts/lib/retained-native-child.mjs";
function child() {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: new EventEmitter(), pid: 1234, kill: vi.fn(() => true) });
}
function corrected() {
  const process = child(), artifacts = new Map<string, string>();
  const retain = (name: string, value: string) => artifacts.set(name, value);
  const oldSource = processEnvOldSource();
  const owned = oldSource ? oldProcessFromSource(oldSource, () => process, retain)("owned") : startRetainedNativeChild("owned", { spawn: () => process, args: [], env: {}, retain, timeoutMs: 100, graceMs: 10, closeLimitMs: 20 });
  return { ...owned, process, artifacts };
}
describe("retained native child lifecycle", () => {
  afterEach(() => vi.useRealTimers());
  it("tracks actual schema dump closure through the same owned-child lifecycle while keeping psql the default", async () => {
    const dump = child(), sql = child(), spawn = vi.fn().mockReturnValueOnce(dump).mockReturnValueOnce(sql), retain = vi.fn();
    const ownedDump = startRetainedNativeChild("schema", { spawn, command: "pg_dump", args: ["--schema-only"], env: {}, retain });
    const ownedSql = startRetainedNativeChild("sql", { spawn, args: ["-X"], env: {}, retain });
    expect(spawn.mock.calls[0]!.slice(0, 2)).toEqual(["pg_dump", ["--schema-only"]]); expect(spawn.mock.calls[1]!.slice(0, 2)).toEqual(["psql", ["-X"]]);
    dump.stdout.emit("data", "create table native(id uuid);\n"); dump.emit("exit", 0, null); expect(ownedDump.done()).toBe(false); dump.emit("close", 0, null); sql.emit("close", 0, null);
    expect(ownedDump.output()).toBe("create table native(id uuid);\n"); expect(await ownedDump.completed).toMatchObject({ closed: true, code: 0 }); await ownedSql.completed;
  });
  it("retains final diagnostics after exit and settles only on close", async () => {
    vi.useFakeTimers(); const owned = corrected(); let settled = false; const result = owned.completed.then(value => { settled = true; return value; }, error => { settled = true; return error; });
    owned.process.stdout.emit("data", "initial\n"); owned.process.emit("exit", 3, null); await Promise.resolve(); expect(settled).toBe(false); expect(owned.done()).toBe(false);
    owned.process.stderr.emit("data", "late final SQL refusal\n"); owned.process.emit("close", 3, null);
    expect(await result).toMatchObject({ code: 3, signal: null, error: null, closed: true, stderr: "late final SQL refusal\n" }); expect(owned.artifacts.get("owned.log")).toContain("late final SQL refusal");
  });
  it("timeout requests bounded termination but awaits actual close and final output", async () => {
    vi.useFakeTimers(); const owned = corrected(); let settled = false; const result = owned.completed.then(value => { settled = true; return value; }, error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(100); expect(owned.process.kill).toHaveBeenCalledWith("SIGTERM"); expect(settled).toBe(false);
    owned.process.stderr.emit("data", "termination diagnostic\n"); owned.process.emit("close", null, "SIGTERM"); expect(await result).toMatchObject({ code: null, signal: "SIGTERM", timedOut: true, terminationRequested: true, closed: true }); expect(owned.artifacts.get("owned.log")).toContain("termination diagnostic");
  });
  it("preserves spawn error and raw close code without settling on error alone", async () => {
    vi.useFakeTimers(); const owned = corrected(); let settled = false; const result = owned.completed.then(value => { settled = true; return value; });
    owned.process.emit("error", new Error("fictional spawn ENOENT")); await Promise.resolve(); expect(settled).toBe(false); owned.process.emit("close", -2, null);
    expect(await result).toMatchObject({ code: -2, signal: null, error: "fictional spawn ENOENT", closed: true });
  });
  it("escalates only an owned unclosed child and records actual resulting signal", async () => {
    vi.useFakeTimers(); const owned = corrected(); const result = owned.completed;
    await vi.advanceTimersByTimeAsync(110); expect(owned.process.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]); owned.process.emit("close", null, "SIGKILL"); expect(await result).toMatchObject({ code: null, signal: "SIGKILL", timedOut: true });
  });
  it("refuses qualification when closure cannot be confirmed and preserves partial diagnostics", async () => {
    vi.useFakeTimers(); const owned = corrected(); const refused = expect(owned.completed).rejects.toThrow("closure was not observed"); owned.process.stderr.emit("data", "partial diagnostics retained\n");
    await vi.advanceTimersByTimeAsync(130); await refused; expect(owned.done()).toBe(false); expect(owned.artifacts.get("owned.log")).toContain("partial diagnostics retained"); expect(JSON.parse(owned.artifacts.get("owned-closure-unconfirmed.json")!)).toMatchObject({ closed: false, pid: 1234 });
  });
  it("observes rejection immediately before the harness begins an eventual cleanup await", async () => {
    vi.useFakeTimers(); const owned = corrected();
    // No caller rejection observer exists during the entire timeout/closure
    // window. Vitest rejects an unhandled rejection if the helper omits its
    // immediate observer; the original promise must still reject on await.
    await vi.advanceTimersByTimeAsync(130);
    expect(owned.done()).toBe(false);
    await expect(owned.completed).rejects.toThrow("closure was not observed");
  });
  it("pins exact sorted installed migration identities and history after inverse AND reapply", () => {
    const source = readFileSync("scripts/check-checkout-final-admission-races.mjs", "utf8");
    expect(source).toContain("jsonb_agg(version::text order by version::text)");
    expect(source).toContain("JSON.stringify(installedLedger) !== JSON.stringify(expectedLedger)");
    expect(source).toContain('run("history-after-inverse", history) !== retained');
    expect(source).toContain('run("history-after-reapply", history) !== retained');
    expect(source).toContain("JSON.stringify(ledgerAfter) !== JSON.stringify(installedLedger)");
  });
  it("pins the actual holder/worker transaction and PostgreSQL pre/post-expiry witnesses before release", () => {
    const source = readFileSync("scripts/check-checkout-final-admission-races.mjs", "utf8");
    expect(source).toContain("w.pid=${workerPid}"); expect(source).toContain("${holding.pid}=any(pg_blocking_pids(w.pid))"); expect(source).toContain("l.transactionid::text=${literal(holding.transaction)}"); expect(source).toContain("l.relation='public.${relation}'::regclass and l.mode='RowShareLock'");
    expect(source).toContain("w.xact_start<expires_at and clock_timestamp()<expires_at"); expect(source).toContain("deadline.afterDeadline !== true || deadline.holderStillBlocking !== true");
    expect(source.indexOf("const sourceBefore = sourceSnapshot()")).toBeLessThan(source.indexOf("async function run")); expect(source.indexOf("await closeOwnedChildren();\n  const sourceAfter")).toBeGreaterThan(source.indexOf("finally {")); expect(source).toContain("JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)");
  });
});
/** Apply the two independent lifecycle witnesses to the exact old production
 * function, using only EventEmitters; no psql/process/database starts. */
function processEnvOldSource() { return process.env.STRELVA_NATIVE_CHILD_OLD_SOURCE ? readFileSync(process.env.STRELVA_NATIVE_CHILD_OLD_SOURCE, "utf8") : null; }
function oldProcessFromSource(source: string, spawn: () => ReturnType<typeof child>, retain: (name: string, value: string) => void) {
  const begin = source.indexOf("function processSql(name)"), end = source.indexOf("async function run(name, sql)", begin);
  // Virtual test time scales the original fixed 15-second timeout to 100ms;
  // the complete old source bytes stay unchanged and no native process starts.
  return runInNewContext(`${source.slice(begin, end)}; processSql`, { spawn, args: [], env: {}, retain, setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay === 15000 ? 100 : delay), clearTimeout }) as (name: string) => ReturnType<typeof startRetainedNativeChild>;
}
