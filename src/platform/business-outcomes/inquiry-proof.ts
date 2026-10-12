import { z } from "zod";

const count = z.number().int().nonnegative().safe();
const seconds = z.number().finite().nonnegative().nullable();

/** A count without its matching acceptance times is incomplete evidence. */
export const inquiryOutcomeCountsSchema = z.object({
  inquiries: count, answered: count, withinDay: count, unanswered: count,
  averageReplySeconds: seconds, medianReplySeconds: seconds,
}).refine(value => value.answered <= value.inquiries && value.withinDay <= value.answered
  && value.unanswered === value.inquiries - value.answered
  && (value.answered === 0
    ? value.averageReplySeconds === null && value.medianReplySeconds === null
    : value.averageReplySeconds !== null && value.medianReplySeconds !== null));

export function inquiryReplyDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}
