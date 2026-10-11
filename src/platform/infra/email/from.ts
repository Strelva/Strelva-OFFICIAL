/** RFC 5322 quoted display name; one transport formatter for owner mail and reports. */
export function formatEmailFrom(name: string, address: string): string {
  const display = name.normalize("NFKC").replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\ufeff\u2060\u180e]/g, "").trim();
  return `"${display.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${address}>`;
}
