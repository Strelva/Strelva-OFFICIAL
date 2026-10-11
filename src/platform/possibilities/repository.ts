import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { possibilitySchema, type Possibility } from "./contracts";

/** Persistence port. Every read is scoped by business; a possibility from
 * another business is indistinguishable from a missing one. Writes are
 * compare-and-set on `revision`. */
export interface PossibilityRepository {
  get(businessId: string, id: string): Promise<Possibility | null>;
  create(value: Possibility): Promise<void>;
  save(value: Possibility, expectedRevision: number): Promise<void>;
  /** Narrow database finalizer; generic save keeps completed plans closed. */
  finalizeNativeGoogleCompletion?(value:Possibility,expectedRevision:number,activationId:string):Promise<void>;
  finalizeNativeGoogleUndo?(value:Possibility,expectedRevision:number,activationId:string):Promise<void>;
  list(businessId: string): Promise<Possibility[]>;
}

export function createInMemoryPossibilityRepository(): PossibilityRepository {
  const rows = new Map<string, Possibility>();
  const key = (businessId: string, id: string) => `${businessId}\u0000${id}`;
  return {
    async get(businessId, id) {
      const row = rows.get(key(businessId, id));
      return row ? structuredClone(row) : null;
    },
    async create(value) {
      const parsed = possibilitySchema.parse(value);
      if (rows.has(key(parsed.businessId, parsed.id))) throw new WorkspaceConflictError("This possibility already exists.");
      rows.set(key(parsed.businessId, parsed.id), structuredClone(parsed));
    },
    async save(value, expectedRevision) {
      const parsed = possibilitySchema.parse(value);
      const current = rows.get(key(parsed.businessId, parsed.id));
      if (!current || current.revision !== expectedRevision) throw new WorkspaceConflictError("This possibility changed. Reload before deciding.");
      rows.set(key(parsed.businessId, parsed.id), structuredClone(parsed));
    },
    async list(businessId) {
      return [...rows.values()].filter((p) => p.businessId === businessId).map((p) => structuredClone(p));
    },
  };
}
