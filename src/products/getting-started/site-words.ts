/**
 * Why a website couldn't be read, in words an owner uses: never robots.txt,
 * crawlers or rebuilding. Pure, so previews show the same sentence the
 * server sends.
 */
export function unreadableSite(code: "unsafe_url" | "unreachable" | "robots_blocked" | "javascript_only", host: string): string {
  if (code === "robots_blocked") return `${host} is set to keep tools like Strelva out, so nothing was read. Add your details yourself.`;
  if (code === "javascript_only") return `${host} only shows its words once a browser runs it, so nothing could be read. Add your details yourself.`;
  if (code === "unsafe_url") return "Enter your public website address, like yourbusiness.com.";
  return `${host} didn't open, so nothing was read. Check the address, or add your details yourself.`;
}
