import { createHash } from "node:crypto";
import { getRedis } from "./redis";
import type { DeliveryLead } from "./delivery-contracts";
import type { LeadWorkflow } from "./lead-workflow-contracts";

/** Redis owns the pre-business lifecycle. One script changes its canonical
 * lead, email projection, workflow and command receipt together. No email. */
export const AGENCY_LEAD_COMMAND_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({error='missing'}) end
local lead = cjson.decode(raw)
local agency = ARGV[1]
if (lead.agencyWorkspaceId and lead.agencyWorkspaceId ~= cjson.null and lead.agencyWorkspaceId ~= agency)
  or (lead.requestType and lead.requestType ~= cjson.null and lead.requestType ~= 'agency_service')
  or lead.statusToken ~= ARGV[2] or lead.email ~= ARGV[3] then
  return cjson.encode({error='access'})
end
local oldReceipt = redis.call('GET', KEYS[4])
if oldReceipt then
  local receipt = cjson.decode(oldReceipt)
  if receipt.fingerprint ~= ARGV[4] then return cjson.encode({error='conflict'}) end
  return cjson.encode(receipt.result)
end
local workflow = {token=lead.statusToken, status='new', updatedAt=cjson.null}
local oldWorkflow = redis.call('GET', KEYS[3])
if oldWorkflow then workflow = cjson.decode(oldWorkflow) end
if type(workflow) ~= 'table' or workflow.token ~= lead.statusToken
  or (workflow.note and workflow.note ~= cjson.null and type(workflow.note) ~= 'string')
  or (workflow.notes and workflow.notes ~= cjson.null and type(workflow.notes) ~= 'table') then
  return cjson.encode({error='corrupt'})
end
if workflow.notes and workflow.notes ~= cjson.null then
  for index, note in pairs(workflow.notes) do
    if type(index) ~= 'number' or index < 1 or index > #workflow.notes or type(note) ~= 'table'
      or type(note.id) ~= 'string' or type(note.text) ~= 'string'
      or type(note.createdAt) ~= 'string' or type(note.createdBy) ~= 'string' then
      return cjson.encode({error='corrupt'})
    end
  end
end
local stages = {received='new', reviewing='contacted', drafting='converting', owner_review='converting', launch_ready='converting', launched='converted', paused='dismissed'}
workflow.status = stages[lead.deliveryStatus] or 'new'
local action = ARGV[5]
local changedStatus = nil
if action == 'note' then
  if not workflow.notes or workflow.notes == cjson.null then workflow.notes = {} end
  if #workflow.notes >= 100 then return cjson.encode({error='notes_full'}) end
  table.insert(workflow.notes, {id=ARGV[6], text=ARGV[8], createdAt=ARGV[7], createdBy=ARGV[9]})
  workflow.note = (workflow.note and workflow.note ~= cjson.null and workflow.note ~= '' and workflow.note .. '\\n\\n' or '') .. ARGV[8]
elseif action == 'begin' then
  if lead.conversion and lead.conversion ~= cjson.null then
    if lead.conversion.idempotencyKey ~= ARGV[6] or lead.conversion.actorId ~= ARGV[9] or lead.conversion.fingerprint ~= ARGV[4] then
      return cjson.encode({error='conversion_locked'})
    end
  elseif workflow.status == 'converted' then return cjson.encode({error='converted'})
  else lead.conversion = {idempotencyKey=ARGV[6], actorId=ARGV[9], fingerprint=ARGV[4], input=cjson.decode(ARGV[8])} end
  changedStatus = lead.conversion.businessWorkspaceId and 'launched' or 'drafting'
elseif action == 'complete' then
  if not lead.conversion or lead.conversion == cjson.null or lead.conversion.idempotencyKey ~= ARGV[6] or lead.conversion.actorId ~= ARGV[9] then
    return cjson.encode({error='conversion_locked'})
  end
  if lead.conversion.businessWorkspaceId and lead.conversion.businessWorkspaceId ~= ARGV[8] then return cjson.encode({error='conflict'}) end
  lead.conversion.businessWorkspaceId = ARGV[8]
  changedStatus = 'launched'
else
  if workflow.status == 'converted' then return cjson.encode({error='converted'}) end
  if lead.conversion and lead.conversion ~= cjson.null then return cjson.encode({error='conversion_locked'}) end
  changedStatus = action == 'convert' and 'drafting' or ARGV[8]
end
if changedStatus then lead.deliveryStatus = changedStatus; lead.statusUpdatedAt = ARGV[7] end
workflow.status = stages[lead.deliveryStatus] or 'new'
workflow.updatedAt = ARGV[7]
local result = {lead=lead, workflow=workflow, legacyOwnership=not lead.agencyWorkspaceId or lead.agencyWorkspaceId == cjson.null, idempotencyKey=ARGV[6]}
local encodedLead = cjson.encode(lead)
local encodedWorkflow = cjson.encode(workflow)
local receipt = cjson.encode({fingerprint=ARGV[4], result=result})
-- All reads, ownership checks, encoding and refusal paths precede any write.
redis.call('SET', KEYS[1], encodedLead, 'KEEPTTL')
redis.call('SET', KEYS[2], encodedLead, 'KEEPTTL')
redis.call('SET', KEYS[3], encodedWorkflow, 'KEEPTTL')
redis.call('SET', KEYS[4], receipt, 'EX', 31536000)
return cjson.encode(result)
`;

export const leadCommandFingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export interface AgencyLeadReceipt { lead: DeliveryLead; workflow: LeadWorkflow; legacyOwnership: boolean; idempotencyKey: string }

export async function persistAgencyLeadCommand(input: {
  agencyWorkspaceId: string; actorId: string; token: string; email: string;
  idempotencyKey: string; fingerprint: string; action: "status" | "note" | "convert" | "begin" | "complete"; value: string;
}): Promise<AgencyLeadReceipt | { error: string }> {
  const redis = getRedis();
  if (!redis) throw new Error("Lead storage is unavailable.");
  const receiptKey = `lead-workflow:command:${input.agencyWorkspaceId}:${input.actorId}:${input.action === "begin" || input.action === "complete" ? input.action + ":" : ""}${input.idempotencyKey}`;
  const raw = await redis.eval(AGENCY_LEAD_COMMAND_SCRIPT,
    [`lead-status:${input.token}`, `lead:${input.email}`, `lead-workflow:${input.token}`, receiptKey],
    [input.agencyWorkspaceId, input.token, input.email, input.fingerprint, input.action, input.idempotencyKey, new Date().toISOString(), input.value, input.actorId]);
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!result || typeof result !== "object") throw new Error("Lead command receipt is unavailable.");
  return result as AgencyLeadReceipt | { error: string };
}
