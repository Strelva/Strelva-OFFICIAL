/**
 * Minimal className merge utility.
 * cn("foo", condition && "bar", "baz") => "foo baz" (when condition is false)
 */
export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ");
}
