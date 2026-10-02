import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { WEBSITE_PUBLIC_SUFFIX_RULES } from "./public-suffix-data";

const exact = new Set<string>(); const wildcard = new Set<string>(); const exceptions = new Set<string>();
for (const rule of WEBSITE_PUBLIC_SUFFIX_RULES.split("\n")) {
  if (rule.startsWith("!")) exceptions.add(domainToASCII(rule.slice(1)));
  else if (rule.startsWith("*.")) wildcard.add(domainToASCII(rule.slice(2)));
  else exact.add(domainToASCII(rule));
}
/** PSL prevailing-rule algorithm includes wildcard exceptions and private hosts. */
export function registrableRebuildDomain(hostname: string): string {
  const host = domainToASCII(hostname.toLowerCase().replace(/\.$/,""));
  if (!host || isIP(host.replace(/^\[|\]$/g,""))) return host;
  const labels = host.split("."); let suffixLength = 1;
  for (let index = 0; index < labels.length; index++) {
    const suffix = labels.slice(index).join(".");
    if (exceptions.has(suffix)) return labels.slice(Math.max(0,index)).join(".");
    if (exact.has(suffix)) suffixLength = Math.max(suffixLength,labels.length-index);
    if (index > 0 && wildcard.has(suffix)) suffixLength = Math.max(suffixLength,labels.length-index+1);
  }
  return labels.slice(Math.max(0,labels.length-suffixLength-1)).join(".");
}
