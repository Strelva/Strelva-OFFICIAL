import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { activationSchema, type Activation } from "./contracts";

/** Durable step log. Compare-and-set on `revision` so a concurrent pause,
 * rollback or second worker can never be overwritten by a late checkpoint. */
export interface ActivationRepository {
  get(businessId: string, id: string): Promise<Activation | null>;
  create(value: Activation): Promise<void>;
  save(value: Activation, expectedRevision: number): Promise<void>;
}

export function createInMemoryActivationRepository(): ActivationRepository {
  const rows = new Map<string, Activation>();
  const key = (businessId: string, id: string) => `${businessId}\u0000${id}`;
  return {
    async get(businessId, id) {
      const row = rows.get(key(businessId, id));
      return row ? structuredClone(row) : null;
    },
    async create(value) {
      const parsed = activationSchema.parse(value);
      if (rows.has(key(parsed.businessId, parsed.id))) throw new WorkspaceConflictError("This activation already exists.");
      rows.set(key(parsed.businessId, parsed.id), structuredClone(parsed));
    },
    async save(value, expectedRevision) {
      const parsed = activationSchema.parse(value);
      const current = rows.get(key(parsed.businessId, parsed.id));
      if (!current || current.revision !== expectedRevision) throw new WorkspaceConflictError("This activation changed. Reload its latest state.");
      rows.set(key(parsed.businessId, parsed.id), structuredClone(parsed));
    },
  };
}
