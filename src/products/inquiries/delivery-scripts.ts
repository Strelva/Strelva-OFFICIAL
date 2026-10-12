/** Redis atomic programs for inquiry budgets, accepted state and provider events.
 * Keep invocation keys/arguments in delivery-store; these scripts contain no
 * provider dispatch or current-actor authority of their own.
 */

export const BUDGET_RESERVATION_SCRIPT = `
local limit = tonumber(ARGV[1])
if not limit or limit < 1 then return -2 end
local current = redis.call("GET", KEYS[1])
if current and tonumber(current) >= limit then return -1 end
local next = redis.call("INCR", KEYS[1])
if next == 1 then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2])) end
if next > limit then
  redis.call("DECR", KEYS[1])
  return -1
end
return next
`;

export const MARK_ACCEPTED_SCRIPT = `
local ttl = tonumber(ARGV[5])
redis.call("SET", KEYS[1], ARGV[1], "EX", ttl)
if ARGV[2] ~= "" then redis.call("SET", KEYS[2], ARGV[2], "EX", ttl) end
if ARGV[3] ~= "" then redis.call("SET", KEYS[3], ARGV[3], "EX", ttl) end
if ARGV[4] ~= "" then redis.call("SET", KEYS[4], ARGV[4], "EX", ttl) end
return 1
`;

// Verification and provider webhooks may finish concurrently. Only transition
// the same accepted attempt; a provider outcome that won first stays terminal.
export const MARK_ACCEPTED_STATE_SCRIPT = `
local currentRaw = redis.call("GET", KEYS[1])
if not currentRaw then return "" end
local current = cjson.decode(currentRaw)
if current.attemptId ~= ARGV[2] then return currentRaw end
if current.status ~= "accepted" and current.status ~= "accepted_unverified" then return currentRaw end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[3]))
return ARGV[1]
`;

// Provider webhooks can arrive out of order and distinct event ids can be
// processed concurrently. Keep the event ordering and terminal-failure rule
// inside Redis so a read followed by a write cannot resurrect a delivered
// or bounced message with stale evidence.
export const MARK_PROVIDER_OUTCOME_SCRIPT = `
local currentRaw = redis.call("GET", KEYS[1])
if not currentRaw then return "" end
local current = cjson.decode(currentRaw)
if current.providerMessageId ~= ARGV[6] then return currentRaw end
if current.status == "sending" or current.status == "unknown" then return currentRaw end
if current.providerEventId == ARGV[4] then return currentRaw end

local function priority(outcome)
  if outcome == "bounced" or outcome == "failed" or outcome == "suppressed" then return 3 end
  if outcome == "delivered" then return 2 end
  if outcome == "deferred" then return 1 end
  return 0
end

local currentPriority = priority(current.providerOutcome)
local nextPriority = priority(ARGV[2])
local apply = false
if nextPriority > currentPriority then
  apply = true
elseif nextPriority == currentPriority then
  if nextPriority == 0 then
    apply = true
  elseif not current.providerEventAt or ARGV[3] > current.providerEventAt then
    apply = true
  end
end
if not apply then return currentRaw end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[5]))
return ARGV[1]
`;

export const CLAIM_PROVIDER_EVENT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current == "completed" then return "completed" end
if current then return "processing" end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
return "claimed"
`;

export const COMPLETE_PROVIDER_EVENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], "completed", "EX", tonumber(ARGV[2]))
return 1
`;

export const RELEASE_PROVIDER_EVENT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;
