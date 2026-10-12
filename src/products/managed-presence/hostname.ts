/** Only a plain public hostname leaves the server; anything else is dropped. */
export function publicHostname(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : undefined;
}
