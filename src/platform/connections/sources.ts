import type { ConnectionSource } from "./contracts";

// Product source modules export factories/objects without registration at import time.
// Next instrumentation registers all eight through src/server/connections/sources.
// The application composition root explicitly registers them once. Re-registering
// the same object is harmless; multiple distinct sources for one provider are allowed.
const sources = new Set<ConnectionSource>();
export function registerConnectionSource(source: ConnectionSource): () => void {
  sources.add(source);
  return () => { sources.delete(source); };
}
export function listConnectionSources(): ConnectionSource[] { return [...sources]; }
