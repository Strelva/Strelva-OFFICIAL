/** Public attribution, pinned when a result is created. #264 owns richer branding. */
export interface AgencyAttribution {
  workspaceId: string;
  slug: string;
  name: string;
  contactUrl: string;
  brand: { logoUrl: string | null; accentColor: string | null };
  replyTo?: string | null;
}

/** Only attributed findings change copy; the scanner's shared cache stays untouched. */
export function providerNeutralCopy(text: string): string {
  return text.replace(/Ask Strelva/g, "Ask your web provider").replace(/ask Strelva/g, "ask your web provider");
}
