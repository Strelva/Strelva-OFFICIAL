/** Authoritative rewards mutations. An ambiguous RPC never falls back to Redis. */
import { clientRecordDb, type ClientRecordDb } from "./mirror";

interface RewardMutation {
  operation: "save" | "adjust" | "log";
  commandId: string;
  member?: Record<string, string>;
  delta?: number;
  tierThreshold?: number;
  transaction?: { id: string; type: string; amount: number; reason: string; timestamp: string };
  actor?: { userId: string; verifiedEmail: string };
}
interface RewardResult {
  status: "saved" | "adjusted" | "logged" | "missing" | "insufficient";
  member?: Record<string, unknown>;
  transaction?: { id: string; type: string; amount: number; reason: string; timestamp: string };
  available?: number;
  requested?: number;
}
export async function mutateRewardRecord(tenant: string, email: string, input: RewardMutation, db: ClientRecordDb | null = clientRecordDb()): Promise<RewardResult> {
  if (!db) throw new Error("rewards_authority_unavailable");
  let response: Awaited<ReturnType<ClientRecordDb["rpc"]>>;
  try {
    response = await db.rpc("mutate_tenant_reward_record", { p_tenant_id: tenant, p_email: email, p_input: input });
  } catch {
    // Transport rejection can follow a committed financial command. Preserve
    // the safe outcome classification and let the route return its command ID.
    throw new Error("rewards_mutation_unconfirmed");
  }
  const { data, error } = response;
  if (error) {
    // Never expose member identifiers or SQL messages to logs/client errors.
    if (error.message?.includes("rewards_access_denied")) throw new Error("rewards_access_denied");
    if (error.message?.includes("rewards_command_conflict") || error.message?.includes("rewards_transaction_conflict")) throw new Error("rewards_command_conflict");
    throw new Error("rewards_mutation_unconfirmed");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("rewards_mutation_unconfirmed");
  const result = data as RewardResult;
  if (!["saved", "adjusted", "logged", "missing", "insufficient"].includes(result.status)) throw new Error("rewards_mutation_unconfirmed");
  if (result.status === "insufficient" && (!Number.isSafeInteger(result.available) || !Number.isSafeInteger(result.requested) || result.available! < 0 || result.requested! <= 0)) throw new Error("rewards_mutation_unconfirmed");
  if (["saved", "adjusted"].includes(result.status) && (!result.member || typeof result.member !== "object" || Array.isArray(result.member))) throw new Error("rewards_mutation_unconfirmed");
  if (result.member) {
    if (result.member.email !== email || !["snapper", "super-snapper"].includes(String(result.member.tier))) throw new Error("rewards_mutation_unconfirmed");
    for (const field of ["starsAvailable", "starsLifetime"]) {
      const balance = String(result.member[field]);
      if (!/^[0-9]+$/.test(balance) || !Number.isSafeInteger(Number(balance))) throw new Error("rewards_mutation_unconfirmed");
    }
  }
  if ((result.status === "logged" || (result.status === "adjusted" && input.transaction)) && (!result.transaction || result.transaction.id !== input.transaction?.id || result.transaction.type !== input.transaction.type || result.transaction.amount !== input.transaction.amount || result.transaction.reason !== input.transaction.reason || !Number.isFinite(Date.parse(result.transaction.timestamp)))) throw new Error("rewards_mutation_unconfirmed");
  return result;
}
