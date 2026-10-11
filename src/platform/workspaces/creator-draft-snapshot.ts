import type { SavedWork } from "./types";
// Process-local capability marker; never accepted from JSON or persisted.
const snapshots = new WeakSet<SavedWork>();
export function markCreatorDraftSnapshot(work: SavedWork): SavedWork { snapshots.add(work); return work; }
export function isCreatorDraftSnapshot(work: SavedWork): boolean { return snapshots.has(work); }
