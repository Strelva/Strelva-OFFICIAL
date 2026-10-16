
/**
 * Visitor mail wears the business's own accent and logo. Which business that
 * is lives in the product layer (its website or recorded branding), so the app
 * edge registers the reader here (src/register-workspace-ports.ts) and the one
 * send path asks it for every business-authored customer email. Presentation
 * only: no reader, a failed read or no brand all mean XA ink, never a held send.
 */
/** The same shape as xa-mail's XaMailBrand, kept here so registering the port loads nothing else. */
type XaMailBrand = { accent: string; onAccent: string; logoUrl?: string | null };
export type VisitorMailBrandReader = (scope: { tenantId?: string | null; workspaceId?: string | null }) => Promise<XaMailBrand | null>;

let reader: VisitorMailBrandReader | null = null;

export function registerVisitorMailBrandReader(next: VisitorMailBrandReader | null): void {
  reader = next;
}

export async function readVisitorMailBrand(scope: { tenantId?: string | null; workspaceId?: string | null }): Promise<XaMailBrand | null> {
  if (!reader || (!scope.tenantId && !scope.workspaceId)) return null;
  try {
    return await reader(scope);
  } catch {
    return null;
  }
}
