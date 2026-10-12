/**
 * The inquiry policy inside Needs you (inquiry 1.0 delta, C6). Pure.
 *
 *  - A reply that quotes a price, names a date or time, or makes a promise is
 *    `customer.commitment`: KIND_RULES fixes it at `owner_decides` (floor and
 *    default), urgent; the tenant adapter makes it owner only. No trust level
 *    or inquiry policy decision moves it.
 *  - Any other reply stays `customer.message`, routed by the inquiry
 *    ResponsibilityPolicy through evaluateRoute (`inquiryDecision`) with its
 *    `strelva_reviews` floor; an owner can only make it stricter.
 *
 * Detection errs toward the owner: a false positive asks the owner about a
 * plain reply, which is safe; a miss would let Strelva promise something.
 */
export type CommitmentSignal = "price" | "date" | "promise";

const PRICE = [
  /[$€£]\s?\d/,
  /\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|usd|bucks)\b/i,
  /\b(?:per|each)\s+(?:head|person|guest|hour|night|plate)\b/i,
  /\b(?:price|pricing|cost|rate|fee|quote|deposit|discount)\b[^.?!\n]{0,40}\d/i,
];
const DATE = [
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)/i,
  /\b(?:tomorrow|tonight|next week|this weekend|next weekend)\b/i,
];
const PROMISE = [
  /\bwe\s+(?:guarantee|promise)\b/i,
  /\b(?:guaranteed|confirmed|booked|reserved)\b/i,
  /\bwe(?:'ll| will| can)\s+(?:hold|reserve|book|fit you in|have it ready|deliver|do it for|match|waive|include)\b/i,
  /\b(?:is|are)\s+(?:yours|available for you)\b/i,
];

/** Which commitments a drafted reply makes. Empty: a plain message. */
export function commitmentSignals(text: string): CommitmentSignal[] {
  const value = text.slice(0, 20_000);
  const out: CommitmentSignal[] = [];
  if (PRICE.some((p) => p.test(value))) out.push("price");
  if (DATE.some((p) => p.test(value))) out.push("date");
  if (PROMISE.some((p) => p.test(value))) out.push("promise");
  return out;
}
