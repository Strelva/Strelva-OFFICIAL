import type { ProposedConnection, SystemIntroduction } from "@/platform/possibilities/contracts";
import type { SystemRef } from "@/platform/possibilities/refs";
import { BaselineMovedError, type LiveSystemsPort } from "./ports";

/**
 * In-memory live System state for local proofs. Reconcile with
 * src/platform/systems (lane B), which owns the real System store.
 * Issued outputs are immutable snapshots of the revision they were issued
 * from; nothing in Make real can rewrite them.
 */

interface Revision { revisionId: string; summary: string; content: Record<string, unknown> }
interface LiveSystem { ref: SystemRef; name: string; lifecycle: "draft" | "live" | "paused"; current: string | null; revisions: Revision[] }
export interface IssuedOutput { outputId: string; systemId: string; revisionId: string; terms: Record<string, unknown>; issuedAt: string; audience: string }

export function createInMemoryLiveSystems() {
  const systems = new Map<string, LiveSystem>();
  const connections = new Map<string, { connectionId: string; businessId: string; from: string; to: string; kind: ProposedConnection["kind"]; purpose: string; active: boolean }>();
  const outputs: IssuedOutput[] = [];
  const keys = new Map<string, unknown>();
  const writes = { stage: 0, introduce: 0, activate: 0, restore: 0, connect: 0, disconnect: 0 };
  const k = (ref: SystemRef) => `${ref.businessId}\u0000${ref.systemId}`;
  let seq = 0;

  function get(ref: SystemRef): LiveSystem {
    const s = systems.get(k(ref));
    if (!s) throw new Error(`Unknown System ${ref.systemId}`);
    return s;
  }

  const port: LiveSystemsPort = {
    async current(ref) {
      const s = systems.get(k(ref));
      const rev = s?.revisions.find((r) => r.revisionId === s.current);
      return rev ? { revisionId: rev.revisionId, content: structuredClone(rev.content) } : null;
    },
    async stageRevision(ref, candidate, key) {
      if (keys.has(key)) return keys.get(key) as { revisionId: string };
      writes.stage += 1;
      const s = get(ref);
      const revisionId = `${ref.systemId}@r${s.revisions.length + 1}`;
      s.revisions.push({ revisionId, summary: candidate.summary, content: structuredClone(candidate.content) });
      keys.set(key, { revisionId });
      return { revisionId };
    },
    async introduceSystem(businessId, intro: SystemIntroduction, key) {
      if (keys.has(key)) return keys.get(key) as { systemId: string; revisionId: string };
      writes.introduce += 1;
      const systemId = `${intro.key}-${++seq}`;
      const revisionId = `${systemId}@r1`;
      systems.set(k({ businessId, systemId }), { ref: { businessId, systemId }, name: intro.name, lifecycle: "draft", current: null, revisions: [{ revisionId, summary: intro.candidate.summary, content: structuredClone(intro.candidate.content) }] });
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
      s.current = revisionId;
      if (revisionId === null) s.lifecycle = "draft";
    },
    async connect(businessId, c, key) {
      if (keys.has(key)) return keys.get(key) as { connectionId: string };
      writes.connect += 1;
      const connectionId = `conn-${++seq}`;
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
      const revisionId = `${ref.systemId}@r1`;
      systems.set(k(ref), { ref, name, lifecycle: "live", current: revisionId, revisions: [{ revisionId, summary: "Initial", content: structuredClone(content) }] });
      return revisionId;
    },
    seedConnection(businessId: string, from: string, to: string, kind: ProposedConnection["kind"], purpose: string) {
      const connectionId = `conn-${++seq}`;
      connections.set(connectionId, { connectionId, businessId, from, to, kind, purpose, active: true });
      return connectionId;
    },
    /** A direct owner edit to a live System, outside any possibility. */
    edit(ref: SystemRef, content: Record<string, unknown>) {
      const s = get(ref);
      const revisionId = `${ref.systemId}@r${s.revisions.length + 1}`;
      s.revisions.push({ revisionId, summary: "Direct edit", content: structuredClone(content) });
      s.current = revisionId;
      return revisionId;
    },
    issueOutput(ref: SystemRef, audience: string, at: string): IssuedOutput {
      const s = get(ref);
      const rev = s.revisions.find((r) => r.revisionId === s.current)!;
      const output = { outputId: `out-${++seq}`, systemId: ref.systemId, revisionId: rev.revisionId, terms: structuredClone(rev.content), issuedAt: at, audience };
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
