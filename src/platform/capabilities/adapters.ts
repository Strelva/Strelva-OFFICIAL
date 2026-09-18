import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { CapabilityAdapterKey, ExecutableCapabilityDefinition } from "./contracts";
import { CapabilityUnavailableError } from "./qualification";
import type { CapabilityRegistry } from "./registry";

export interface CapabilityInvocationContext {
  actor: WorkspaceActor;
  workspaceId: string;
  workId?: string;
  responsibilityId?: string;
  executionKey?: string;
  budgetId?: string;
  /** The accepted step's optimistic source clock, checked by native recheck. */
  expectedUpdatedAt?: string;
  /** The exact registry selection carried by the accepted step. */
  capabilityId?: string;
  capabilityVersion?: number;
}

/**
 * Product modules implement this port by calling their existing command
 * functions. The platform validates the capability/version and payload before
 * entering the port, while the product command remains the authority.
 */
export interface ExecutableCapabilityAdapter<TInput = unknown, TResult = unknown> {
  readonly key: CapabilityAdapterKey;
  /** Normalize server-derived guards before the definition schema runs. */
  prepare?(context: CapabilityInvocationContext, input: unknown): TInput | Promise<TInput>;
  inspect?(context: CapabilityInvocationContext, input: TInput): Promise<void>;
  recheck(context: CapabilityInvocationContext, input: TInput): Promise<void>;
  perform(context: CapabilityInvocationContext, input: TInput): Promise<TResult>;
}

export type CapabilityAdapterMap = ReadonlyMap<CapabilityAdapterKey, ExecutableCapabilityAdapter>;

export class CapabilityAdapterUnavailableError extends Error {
  readonly adapterKey: CapabilityAdapterKey;

  constructor(adapterKey: CapabilityAdapterKey) {
    super(`No adapter is registered for executable capability ${adapterKey}.`);
    this.name = "CapabilityAdapterUnavailableError";
    this.adapterKey = adapterKey;
  }
}

export interface CapabilityInvoker {
  inspect(
    id: string,
    version: number,
    context: CapabilityInvocationContext,
    input: unknown,
  ): Promise<void>;
  recheck(
    id: string,
    version: number,
    context: CapabilityInvocationContext,
    input: unknown,
  ): Promise<void>;
  perform<TResult = unknown>(
    id: string,
    version: number,
    context: CapabilityInvocationContext,
    input: unknown,
  ): Promise<TResult>;
}

function adapterFor(
  definition: ExecutableCapabilityDefinition,
  adapters: CapabilityAdapterMap,
): ExecutableCapabilityAdapter {
  const adapter = adapters.get(definition.adapterKey);
  if (!adapter || adapter.key !== definition.adapterKey) {
    throw new CapabilityAdapterUnavailableError(definition.adapterKey);
  }
  return adapter;
}

function parseInput(definition: ExecutableCapabilityDefinition, raw: unknown): unknown {
  try {
    return definition.inputSchema.parse(raw);
  } catch {
    throw new CapabilityUnavailableError(definition.id, "entrance_unavailable", definition.version);
  }
}

/**
 * Create the shared runner port. The required version is deliberate: a
 * stronger adapter or model cannot replace the command selected by accepted
 * work. The product adapter still performs current membership and policy
 * checks in its recheck/perform implementations.
 */
export function createCapabilityInvoker(
  registry: CapabilityRegistry,
  adapters: CapabilityAdapterMap,
): CapabilityInvoker {
  async function resolve(id: string, version: number, context: CapabilityInvocationContext, raw: unknown) {
    const qualified = registry.requireExact(id, version, "runner");
    const adapter = adapterFor(qualified.definition, adapters);
    const prepared = adapter.prepare ? await adapter.prepare(context, raw) : raw;
    const input = parseInput(qualified.definition, prepared);
    return { definition: qualified.definition, input, adapter };
  }

  const invoker: CapabilityInvoker = {
    async inspect(id: string, version: number, context: CapabilityInvocationContext, raw: unknown) {
      const { definition, input, adapter } = await resolve(id, version, context, raw);
      if (adapter.inspect) await adapter.inspect(context, input);
      else await adapter.recheck(context, input);
      // Keep the explicit definition reference in the call path so an
      // adapter cannot accidentally be selected by a display label.
      void definition;
    },
    async recheck(id: string, version: number, context: CapabilityInvocationContext, raw: unknown) {
      const { adapter, input } = await resolve(id, version, context, raw);
      await adapter.recheck(context, input);
    },
    async perform<TResult = unknown>(id: string, version: number, context: CapabilityInvocationContext, raw: unknown) {
      const { definition, adapter, input } = await resolve(id, version, context, raw);
      // A direct perform call is a complete authority boundary. Callers may
      // still perform an earlier preflight, but cannot skip this final check.
      await adapter.recheck(context, input);
      const result = await adapter.perform(context, input);
      return definition.resultSchema.parse(result) as TResult;
    },
  };
  return invoker;
}
