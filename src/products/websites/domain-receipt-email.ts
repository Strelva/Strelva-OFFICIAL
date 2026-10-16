import type { PaperEmail } from "@/platform/infra/email/paper";

/**
 * "<hostname> is connected": the one email an owner gets when a domain they
 * approved starts opening their website. Presentation only; the caller owns
 * the send gate (websiteDomainEmailAllowed), which stays off during rollout.
 */
export function domainConnectedPaperEmail(input: { hostname: string; checkedAt: string; businessName?: string }): PaperEmail {
  const checked = readableCheck(input.checkedAt);
  return {
    subject: `${input.hostname} is connected`,
    preheader: `Strelva checked ${input.hostname} and it opens your published website.`,
    sender: "Strelva", senderDetail: input.businessName ? `For ${input.businessName}` : "Your website",
    ...(input.businessName ? { businessName: input.businessName } : {}),
    footer: "You get this once, when a domain you approved starts working. Strelva never changes your DNS.",
    blocks: [
      { kind: "paragraph", text: `Strelva confirmed ${input.hostname} is verified and opens your published website. Visitors can use it now.` },
      { kind: "rows", rows: [{ label: input.hostname, value: "Connected", tone: "live" }, { label: "Last check", value: checked }] },
      { kind: "actions", actions: [{ label: "Open your website", url: `https://${input.hostname}`, style: "primary" }], full: true },
      { kind: "paragraph", text: "Your mail records were left as they were.", muted: true },
    ],
  };
}

function readableCheck(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date)} UTC`;
}
