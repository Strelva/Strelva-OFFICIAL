import { z } from 'zod';
import { connectDb, type RpcDb } from './index';
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from '@/platform/workspaces/types';
import { neutralCreatorMoneyCommandSchema, neutralCreatorListingCommandSchema, neutralVersionCollectionCommandSchema, neutralPaidVersionReceiptSchema, neutralCreatorSourcesSchema, neutralVersionMoneyGraphSchema, neutralReceiptMatches } from './neutral-creator-contract';
export { neutralCreatorMoneyCommandSchema, neutralCreatorListingCommandSchema, neutralVersionCollectionCommandSchema } from './neutral-creator-contract';
async function rpc(name: string, actor: WorkspaceActor, args: Record<string, unknown>, db: RpcDb | null) {
  if (!db) throw new WorkspaceStoreError('Creator money records are unavailable.');
  const result = await db.rpc(name, { ...args, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) {
    const message = result.error.message ?? '';
    if (/denied|owner_required|future_work_blocked|access_denied/.test(message)) throw new WorkspaceAccessError();
    if (/conflict|changed|not_configured|required|unqualified/.test(message)) throw new WorkspaceConflictError('The exact qualified source, installed Version or written terms could not be confirmed. Reload before continuing.');
    throw new WorkspaceStoreError('Creator money operation could not be confirmed.');
  }
  return result.data;
}
export async function readNeutralCreatorSources(actor: WorkspaceActor, workspaceId: string, db: RpcDb | null = connectDb()) {
  const graph = neutralCreatorSourcesSchema.parse(await rpc('read_neutral_creator_sources', actor, { p_workspace_id: z.uuid().parse(workspaceId) }, db));
  if (graph.workspaceId !== workspaceId || graph.sources.some(source => source.creatorWorkspaceId !== workspaceId || source.definitionId !== `system-source:${source.sourceSystemId}`)) throw new WorkspaceStoreError('Creator sources do not match this workspace.');
  return graph;
}
export async function readNeutralVersionMoney(actor: WorkspaceActor, workspaceId: string, db: RpcDb | null = connectDb()) {
  const graph = neutralVersionMoneyGraphSchema.parse(await rpc('read_neutral_version_money', actor, { p_workspace_id: z.uuid().parse(workspaceId) }, db));
  if (graph.workspaceId !== workspaceId || graph.history.some(receipt => receipt.business_workspace_id !== workspaceId) || graph.installations.some(item => item.definitionId !== `system-source:${item.sourceSystemId}`)) throw new WorkspaceStoreError('Paid Version history does not match this workspace.');
  return graph;
}
export async function registerNeutralCreatorListing(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const command = neutralCreatorListingCommandSchema.parse(raw);
  const receipt = z.object({ id: z.uuid(), creatorWorkspaceId: z.literal(command.workspaceId), sourceSystemId: z.uuid(), sourceRevisionId: z.literal(command.sourceRevisionId), definitionId: z.string(), agreementVersion: z.literal(command.agreementVersion), rateReference: z.literal(command.rateReference) }).strict().parse(await rpc('register_neutral_creator_listing', actor, { p_command: command }, db));
  if (receipt.definitionId !== `system-source:${receipt.sourceSystemId}`) throw new WorkspaceStoreError('Listing source identity is invalid.');
  return receipt;
}
export async function recordNeutralCreatorMoney(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const command = neutralCreatorMoneyCommandSchema.parse(raw);
  const receipt = z.object({ action: z.literal(command.action), recordedBy: z.literal(actor.userId), replayed: z.boolean(), creatorWorkspaceId: z.uuid(), sourceSystemId:z.uuid(), definitionId: z.string(), command: neutralCreatorMoneyCommandSchema }).strict().parse(await rpc('record_neutral_creator_money', actor, { p_command: command }, db));
  if (receipt.definitionId !== `system-source:${receipt.sourceSystemId}` || JSON.stringify(receipt.command) !== JSON.stringify(command)) throw new WorkspaceStoreError('Written creator terms do not match the exact command.');
  return receipt;
}
export async function prepareNeutralVersionCollection(actor: WorkspaceActor, raw: unknown, db: RpcDb | null = connectDb()) {
  const command = neutralVersionCollectionCommandSchema.parse(raw);
  const receipt = neutralPaidVersionReceiptSchema.parse(await rpc('prepare_neutral_version_collection', actor, { p_command: command }, db));
  if (!neutralReceiptMatches(receipt, command, actor.userId)) throw new WorkspaceStoreError('The accepted paid Version period does not match this owner and exact command.');
  return receipt;
}
