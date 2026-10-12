/**
 * Normalize user-provided text before it is placed in an email subject or
 * notification label. HTML is treated as text and control whitespace is
 * collapsed so email content cannot change its intended layout.
 */
export function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
