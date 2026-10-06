/** The lowest rating a reply may auto-post for. A 1 or 2 star review's reply
 * always goes to the owner, even in `auto` mode (publishing spec, section 3). */
export const AUTO_REPLY_MIN_RATING = 3;

/** Whether `auto` mode may post this review's reply on its own. Unknown
 * ratings go to the owner. */
export function autoReplyAllowed(rating: unknown): boolean {
  return typeof rating === "number" && Number.isFinite(rating) && rating >= AUTO_REPLY_MIN_RATING;
}
