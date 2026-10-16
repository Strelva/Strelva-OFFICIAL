/**
 * XA · R1 "Read by": which Systems read each business-record detail, taken
 * from the business's own System graph (stored Connections plus the ones
 * derived from what already runs: a connected site reads the record's facts,
 * each Google listing reads hours, phone, links and description).
 *
 * Only live Systems with a connected `read` Connection to a
 * `business_record:*` resource count. Nothing is guessed: a detail no System
 * reads gets no tiles, and an empty result means the column is not drawn.
 */
import type { RecordReaders } from "@/experience/places/BusinessDetailsForm";

type GraphSystem = { system: { id: string; name: string; kind: string; lifecycle: string } };
type GraphConnection = { connection: { source: { systemId: string }; kind: string; state: string; target: { type: string; resource?: string } } };

/** `business_record:facts` is the whole public record a site fills itself from. */
const WHOLE_RECORD = ["display_name", "phone", "email", "address", "hours", "description", "services"] as const;

/** Record slice to the details it covers. Unknown slices name a fact key directly. */
function detailsFor(resource: string): readonly string[] {
  const slice = resource.startsWith("business_record:") ? resource.slice("business_record:".length) : null;
  if (!slice) return [];
  if (slice === "facts") return WHOLE_RECORD;
  // "links" is the website address on Google; the record shows no row for it.
  if (slice === "links") return [];
  return [slice];
}

/** System kind to the clay it wears on this page. */
const CLAY: Record<string, string> = { website: "website", listing: "listing", booking: "bookings", inquiry: "inbox", newsletter: "newsletter", document: "documents" };

export function readersFromSystems(graph: { systems: readonly GraphSystem[]; connections: readonly GraphConnection[] }): RecordReaders | undefined {
  const live = new Map(graph.systems.filter(item => item.system.lifecycle === "live").map(item => [item.system.id, item.system]));
  const out: Record<string, { kind: string; name: string }[]> = {};
  for (const { connection } of graph.connections) {
    if (connection.kind !== "read" || connection.state !== "connected" || connection.target.type !== "business_resource" || !connection.target.resource) continue;
    const system = live.get(connection.source.systemId);
    if (!system) continue;
    for (const detail of detailsFor(connection.target.resource)) {
      const list = out[detail] ??= [];
      if (!list.some(item => item.name === system.name)) list.push({ kind: CLAY[system.kind] ?? system.kind, name: system.name });
    }
  }
  return Object.keys(out).length ? out : undefined;
}
