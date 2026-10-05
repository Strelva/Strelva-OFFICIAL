import type {
  ConnectionHealth,
  HealthReason,
  HealthStatus,
  Observation,
  ResourceNode,
  SystemAvailability,
  SystemConnection,
  SystemHealth,
  SystemLifecycle,
  SystemNode,
} from "./contracts";

const RANK: Record<HealthStatus, number> = { healthy: 0, unknown: 1, degraded: 2, blocked: 3 };

function worst(reasons: readonly HealthReason[]): HealthStatus {
  let status: HealthStatus = "healthy";
  for (const reason of reasons) {
    if (reason.effect === "notice") continue;
    if (RANK[reason.effect] > RANK[status]) status = reason.effect;
  }
  return status;
}

/** Lifecycle alone decides what a System takes and keeps. Health never does. */
export function systemAvailability(lifecycle: SystemLifecycle): SystemAvailability {
  if (lifecycle === "live") return { acceptsNew: true, readable: true, keepsObligations: true };
  // Paused blocks new specified behavior. Records stay, accepted obligations
  // stay, and a static report or proposal stays readable without a worker.
  if (lifecycle === "paused") return { acceptsNew: false, readable: true, keepsObligations: true };
  return { acceptsNew: false, readable: false, keepsObligations: true };
}

interface Evidence {
  reasons: HealthReason[];
  lastVerifiedAt: string | null;
  stale: boolean;
  /** A fresh blocking failure: the account/connection itself is cut. */
  severed: boolean;
}

function ownEvidence(observations: readonly Observation[], now: number, requireEvidence: boolean): Evidence {
  const reasons: HealthReason[] = [];
  let lastVerifiedAt: string | null = null;
  let stale = false;
  let severed = false;
  for (const observation of observations) {
    const base = { signal: observation.signal, source: observation.source, observedAt: observation.observedAt };
    const at = observation.observedAt ? Date.parse(observation.observedAt) : Number.NaN;
    if (!Number.isFinite(at)) {
      reasons.push({ ...base, code: "observation_unknown", effect: "unknown", message: observation.message || "This has never been checked." });
      continue;
    }
    if (now - at > observation.maxAgeSeconds * 1000) {
      stale = true;
      reasons.push({ ...base, code: "evidence_stale", effect: "unknown", message: `Last checked ${observation.observedAt}; that is too old to prove it still works.` });
      continue;
    }
    if (observation.outcome !== "unknown" && (!lastVerifiedAt || at > Date.parse(lastVerifiedAt))) lastVerifiedAt = observation.observedAt;
    if (observation.outcome === "fail") {
      const blocking = observation.impact === "blocking";
      if (blocking) severed = true;
      reasons.push({ ...base, code: "observation_failed", effect: blocking ? "blocked" : "degraded", message: observation.message });
    } else if (observation.outcome === "warn") {
      reasons.push({ ...base, code: "observation_warning", effect: "degraded", message: observation.message });
    } else if (observation.outcome === "unknown") {
      reasons.push({ ...base, code: "observation_unknown", effect: "unknown", message: observation.message });
    }
  }
  if (!observations.length && requireEvidence) {
    reasons.push({ code: "no_evidence", effect: "unknown", message: "Nothing has checked this yet." });
  }
  return { reasons, lastVerifiedAt, stale, severed };
}

export interface HealthGraph {
  systems: readonly SystemNode[];
  resources?: readonly ResourceNode[];
  connections: readonly SystemConnection[];
  observations: readonly Observation[];
}

interface SubjectHealth {
  status: HealthStatus;
  evidence: Evidence;
  reasons: HealthReason[];
  connections: ConnectionHealth[];
}

/**
 * Derive every System's health from its own evidence and its connections.
 *
 * - Own evidence: fresh failures block or degrade; stale or missing evidence is
 *   `unknown`, never `healthy`. A static System needs no running worker, so no
 *   evidence does not make it unknown.
 * - `depend`: a blocked or degraded dependency degrades the dependent System,
 *   transitively. A Paused or Draft dependency is a notice and a stale
 *   connection, not a failure: it is intended.
 * - `appear`: when a System appears inside another (bookings on a website),
 *   pausing it marks that projection stale on the host; a blocked or degraded
 *   one degrades the host. This is one hop and does not propagate further.
 */
export function deriveSystemHealth(graph: HealthGraph, now: number = Date.now()): Map<string, SystemHealth> {
  const systems = new Map(graph.systems.map(system => [system.id, system]));
  const resources = new Map((graph.resources ?? []).map(resource => [resource.id, resource]));
  const observationsBy = new Map<string, Observation[]>();
  for (const observation of graph.observations) {
    const list = observationsBy.get(observation.subjectId) ?? [];
    list.push(observation);
    observationsBy.set(observation.subjectId, list);
  }
  const memo = new Map<string, SubjectHealth>();
  const visiting = new Set<string>();

  function subject(id: string): SubjectHealth | null {
    const cached = memo.get(id);
    if (cached) return cached;
    const system = systems.get(id);
    const resource = resources.get(id);
    if (!system && !resource) return null;
    if (visiting.has(id)) {
      // A dependency cycle cannot prove itself healthy.
      return { status: "unknown", evidence: { reasons: [], lastVerifiedAt: null, stale: false, severed: false }, reasons: [], connections: [] };
    }
    visiting.add(id);
    const evidence = ownEvidence(observationsBy.get(id) ?? [], now, system ? system.operation === "ongoing" : true);
    const reasons = [...evidence.reasons];
    const connections: ConnectionHealth[] = [];
    if (system) {
      for (const connection of graph.connections.filter(item => item.from === id && item.kind !== "appear")) {
        const targetSystem = systems.get(connection.to);
        const target = subject(connection.to);
        const via = { connectionId: connection.id, subjectId: connection.to };
        if (!target) {
          connections.push({ connectionId: connection.id, to: connection.to, kind: connection.kind, state: "disconnected", reason: "The connected thing no longer exists." });
          if (connection.kind === "depend") reasons.push({ code: "dependency_missing", effect: "blocked", message: "Something this depends on is gone.", via });
          continue;
        }
        if (targetSystem && targetSystem.lifecycle !== "live") {
          const word = targetSystem.lifecycle === "paused" ? "paused" : "not live yet";
          connections.push({ connectionId: connection.id, to: connection.to, kind: connection.kind, state: "stale", reason: `${targetSystem.name} is ${word}.` });
          if (connection.kind === "depend") reasons.push({ code: "dependency_not_live", effect: "notice", message: `${targetSystem.name} is ${word}, so what this shows from it is not current.`, via });
          continue;
        }
        const state = target.evidence.severed ? "disconnected" : target.status === "unknown" ? "stale" : "connected";
        connections.push({ connectionId: connection.id, to: connection.to, kind: connection.kind, state, ...(state !== "connected" ? { reason: target.reasons.find(reason => reason.effect !== "notice")?.message ?? "Not verified." } : {}) });
        if (connection.kind !== "depend") continue;
        const name = targetSystem?.name ?? resources.get(connection.to)?.name ?? connection.to;
        if (target.status === "blocked") reasons.push({ code: "dependency_blocked", effect: "degraded", message: `${name} is not working.`, via });
        else if (target.status === "degraded") reasons.push({ code: "dependency_degraded", effect: "degraded", message: `${name} is degraded.`, via });
        else if (target.status === "unknown") reasons.push({ code: "dependency_unknown", effect: "unknown", message: `${name} has not been verified recently.`, via });
      }
    }
    visiting.delete(id);
    const result: SubjectHealth = { status: worst(reasons), evidence, reasons, connections };
    memo.set(id, result);
    return result;
  }

  for (const system of graph.systems) subject(system.id);

  // Placements: one hop from the appearing System to its host.
  const appearReasons = new Map<string, HealthReason[]>();
  const appearConnections = new Map<string, ConnectionHealth[]>();
  for (const connection of graph.connections.filter(item => item.kind === "appear")) {
    const placed = systems.get(connection.from);
    const placedHealth = subject(connection.from);
    if (!placed || !placedHealth) continue;
    const host = systems.get(connection.to);
    const list = appearConnections.get(placed.id) ?? [];
    if (!host) {
      list.push({ connectionId: connection.id, to: connection.to, kind: "appear", state: "disconnected", reason: "The place it appeared no longer exists." });
      appearConnections.set(placed.id, list);
      continue;
    }
    const via = { connectionId: connection.id, subjectId: placed.id };
    const hostReasons = appearReasons.get(host.id) ?? [];
    if (placed.lifecycle !== "live") {
      list.push({ connectionId: connection.id, to: host.id, kind: "appear", state: "stale", reason: `${placed.name} is ${placed.lifecycle}; ${host.name} shows it as not taking new requests.` });
      hostReasons.push({ code: "projection_stale", effect: "notice", message: `${placed.name} is ${placed.lifecycle === "paused" ? "paused" : "not live yet"}, so its section on ${host.name} takes no new requests.`, via });
    } else if (placedHealth.status === "blocked" || placedHealth.status === "degraded") {
      list.push({ connectionId: connection.id, to: host.id, kind: "appear", state: "connected" });
      hostReasons.push({ code: "projection_stale", effect: "degraded", message: `${placed.name} is ${placedHealth.status === "blocked" ? "not working" : "degraded"}, so its section on ${host.name} may fail for visitors.`, via });
    } else {
      list.push({ connectionId: connection.id, to: host.id, kind: "appear", state: "connected" });
    }
    appearConnections.set(placed.id, list);
    appearReasons.set(host.id, hostReasons);
  }

  const result = new Map<string, SystemHealth>();
  for (const system of graph.systems) {
    const own = subject(system.id)!;
    const reasons = [...own.reasons, ...(appearReasons.get(system.id) ?? [])];
    result.set(system.id, {
      systemId: system.id,
      lifecycle: system.lifecycle,
      availability: systemAvailability(system.lifecycle),
      status: worst(reasons),
      reasons,
      lastVerifiedAt: own.evidence.lastVerifiedAt,
      stale: own.evidence.stale,
      connections: [...own.connections, ...(appearConnections.get(system.id) ?? [])],
    });
  }
  return result;
}
