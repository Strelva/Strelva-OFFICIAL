import type { ProposedConnection, SystemIntroduction } from "@/platform/possibilities/contracts";
import type { SystemLifecycle, SystemRef } from "@/platform/systems/contracts";
import { BaselineMovedError, type LiveSystemsPort } from "./ports";

/**
 * A small in-memory fake of live System state for fast local proofs. The real
 * port is `createSystemStoreLiveSystems` (systems-adapter.ts) over the spine's
 * SystemStore. Ids are UUIDs so pinned baselines satisfy the canonical refs.
 * Issued outputs are immutable snapshots of the revision they were issued
 * from; nothing in Make real can rewrite them.
 */

interface Revision { revisionId: string; number: number; summary: string; content: Record<string, unknown> }
interface LiveSystem { ref: SystemRef; name: string; lifecycle: SystemLifecycle; current: string | null; revisions: Revision[] }
export interface IssuedOutput { outputId: string; systemId: string; revisionId: string; terms: Record<string, unknown>; issuedAt: string; audience: string }

export function createInMemoryLiveSystems() {
  const systems = new Map<string, LiveSystem>();
  const connections = new Map<string, { connectionId: string; businessId: string; from: string; to: string; kind: ProposedConnection["kind"]; purpose: string; active: boolean }>();
  const outputs: IssuedOutput[] = [];
  const keys = new Map<string, unknown>();
  const writes = { stage: 0, introduce: 0, activate: 0, restore: 0, connect: 0, disconnect: 0 };
  const k = (ref: SystemRef) => `${ref.businessId}\u0000${ref.systemId}`;
  let seq = 0;
  /** Deterministic RFC 4122 shaped ids, so fixtures stay readable in failures. */
  const uuid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;

  function get(ref: SystemRef): LiveSystem {
    const s = systems.get(k(ref));
    if (!s) throw new Error(`Unknown System ${ref.systemId}`);
    return s;
  }

  const port: LiveSystemsPort = {
    async current(ref) {
      const s = systems.get(k(ref));
      const rev = s?.revisions.find((r) => r.revisionId === s.current);
      return rev ? { revisionId: rev.revisionId, number: rev.number, content: structuredClone(rev.content) } : null;
    },
    async stageRevision(ref, candidate, key) {
      if (keys.has(key)) return keys.get(key) as { revisionId: string };
      writes.stage += 1;
      const s = get(ref);
      const revisionId = uuid();
      s.revisions.push({ revisionId, number: s.revisions.length + 1, summary: candidate.summary, content: structuredClone(candidate.content) });
      keys.set(key, { revisionId });
      return { revisionId };
    },
    async introduceSystem(businessId, intro: SystemIntroduction, key) {
      if (keys.has(key)) return keys.get(key) as { systemId: string; revisionId: string };
      writes.introduce += 1;
      const systemId = uuid();
      const revisionId = uuid();
      systems.set(k({ businessId, systemId }), { ref: { businessId, systemId }, name: intro.name, lifecycle: "draft", current: null, revisions: [{ revisionId, number: 1, summary: intro.candidate.summary, content: structuredClone(intro.candidate.content) }] });
      keys.set(key, { systemId, revisionId });
      return { systemId, revisionId };
    },
    async activate(ref, revisionId, expectedCurrent) {
      const s = get(ref);
      if (s.current !== expectedCurrent) throw new BaselineMovedError(ref.systemId, s.current);
      if (!s.revisions.some((r) => r.revisionId === revisionId)) throw new Error("Unknown revision");
      writes.activate += 1;
      s.current = revisionId;
      s.lifecycle = "live";
    },
    async restore(ref, revisionId, expectedCurrent) {
      const s = get(ref);
      if (s.current !== expectedCurrent) throw new BaselineMovedError(ref.systemId, s.current);
      writes.restore += 1;
      // Same rule as the System store: the pointer is never cleared and a
      // live System never returns to draft. Undoing an introduction pauses it.
      if (revisionId === null) { if (s.lifecycle === "live") s.lifecycle = "paused"; return; }
      s.current = revisionId;
    },
    async connect(businessId, c, key) {
      if (keys.has(key)) return keys.get(key) as { connectionId: string };
      writes.connect += 1;
      const connectionId = uuid();
      connections.set(connectionId, { connectionId, businessId, ...c, active: true });
      keys.set(key, { connectionId });
      return { connectionId };
    },
    async disconnect(businessId, connectionId) {
      const c = connections.get(connectionId);
      if (c && c.businessId === businessId) { c.active = false; writes.disconnect += 1; }
    },
  };

  return {
    port,
    writes,
    /** Fixture setup: an existing live System with one revision. */
    seed(ref: SystemRef, name: string, content: Record<string, unknown>) {
      const revisionId = uuid();
      systems.set(k(ref), { ref, name, lifecycle: "live", current: revisionId, revisions: [{ revisionId, number: 1, summary: "Initial", content: structuredClone(content) }] });
      return revisionId;
    },
    seedConnection(businessId: string, from: string, to: string, kind: ProposedConnection["kind"], purpose: string) {
      const connectionId = uuid();
      connections.set(connectionId, { connectionId, businessId, from, to, kind, purpose, active: true });
      return connectionId;
    },
    /** A direct owner edit to a live System, outside any possibility. */
    edit(ref: SystemRef, content: Record<string, unknown>) {
      const s = get(ref);
      const revisionId = uuid();
      s.revisions.push({ revisionId, number: s.revisions.length + 1, summary: "Direct edit", content: structuredClone(content) });
      s.current = revisionId;
      return revisionId;
    },
    issueOutput(ref: SystemRef, audience: string, at: string): IssuedOutput {
      const s = get(ref);
      const rev = s.revisions.find((r) => r.revisionId === s.current)!;
      const output = { outputId: uuid(), systemId: ref.systemId, revisionId: rev.revisionId, terms: structuredClone(rev.content), issuedAt: at, audience };
      outputs.push(output);
      return structuredClone(output);
    },
    outputs: () => structuredClone(outputs),
    system: (ref: SystemRef) => { const s = systems.get(k(ref)); return s ? structuredClone({ name: s.name, lifecycle: s.lifecycle, current: s.current, revisions: s.revisions.map((r) => r.revisionId) }) : null; },
    findByName: (businessId: string, name: string) => [...systems.values()].find((s) => s.ref.businessId === businessId && s.name === name)?.ref.systemId ?? null,
    connections: (businessId: string) => [...connections.values()].filter((c) => c.businessId === businessId).map((c) => structuredClone(c)),
  };
}

export type InMemoryLiveSystems = ReturnType<typeof createInMemoryLiveSystems>;
