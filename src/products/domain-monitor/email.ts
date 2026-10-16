import type { PaperBlock, PaperEmail } from "@/platform/infra/email/paper";
import { cleanSubjectText } from "@/platform/infra/email/text";

export interface DomainAlertLine { siteName: string; host: string; problem: string }

/**
 * The domain monitor's notice to Strelva's operators: which sites are down,
 * which domains expire soon, or that everything is back. Plain sentences, the
 * site named before its host, no capitals for alarm.
 */
export function domainMonitorPaperEmail(input: { down: readonly DomainAlertLine[]; expiring: readonly DomainAlertLine[]; boardUrl: string }): PaperEmail {
  const { down, expiring } = input;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const recovered = down.length === 0 && expiring.length === 0;
  const subject = recovered ? "Every monitored site is back up"
    : down.length === 1 ? `${cleanSubjectText(down[0]!.host)} is down`
      : down.length ? `${plural(down.length, "site is", "sites are")} down`
        : expiring.length === 1 ? `${cleanSubjectText(expiring[0]!.host)} expires within 30 days` : `${plural(expiring.length, "domain expires", "domains expire")} within 30 days`;
  // The body adds what the subject can't: what the check saw and what happens next.
  const next = "The monitor checks again every 30 minutes and sends one more email when this changes.";
  // One site down: the row below carries the fact, so the sentence only says what happens next.
  const single = down.length === 1 && !expiring.length;
  const summary = recovered ? "Every monitored site answers again, and no domain expires within 30 days."
    : single ? next
      : `${[down.length ? `${plural(down.length, "site is", "sites are")} down` : "", expiring.length ? `${plural(expiring.length, "domain expires", "domains expire")} within 30 days` : ""].filter(Boolean).join(", and ")}. ${next}`;
  const preheader = single ? `${cleanSubjectText(down[0]!.siteName)}: ${cleanSubjectText(down[0]!.problem)}` : summary;
  const row = (line: DomainAlertLine) => ({ label: cleanSubjectText(line.siteName), value: `${line.host} · ${cleanSubjectText(line.problem)}`, tone: "need" as const });
  const blocks: PaperBlock[] = [{ kind: "paragraph", text: summary }];
  if (down.length) blocks.push({ kind: "label", text: "Down now" }, { kind: "rows", rows: down.map(row) });
  if (expiring.length) blocks.push({ kind: "label", text: "Expires within 30 days" }, { kind: "rows", rows: expiring.map(row) });
  blocks.push({ kind: "actions", actions: [{ label: "Open the uptime board", url: input.boardUrl, style: "primary" }], full: true });
  return { subject, preheader, sender: "Strelva", senderDetail: "Domain monitor", footer: "For Strelva operators. Sent when a monitored site goes down, recovers, or a domain nears expiry.", blocks };
}
