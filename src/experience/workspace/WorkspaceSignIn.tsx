import { authEmailCodeReady, authEmailReady } from "@/components/auth/email-readiness";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import type { ReactNode } from "react";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";

/**
 * Getting back in (XA, designed from B1 and C1). One column of words and one
 * email field; the felt shows Pebble resting beside the bookings calendar,
 * because the work kept going while the person was away. Whoever's door this
 * is (Strelva, the agency, or the business's own admin host) names itself in
 * the header. Access is still decided by the destination, never here.
 */
export function WorkspaceSignIn({ next = "/workspace", failed = false, title = "Sign in to your Strelva work.", description = "Use the email you signed up or were invited with.", prefillEmail = "", children, brand, brandFontFamily, host, resume, emailReady, codeReady, initialStatus, mode }: {
  next?: string; failed?: boolean; title?: string; description?: string; prefillEmail?: string; children?: ReactNode;
  brand?: ReactNode | OwnerBrand; brandFontFamily?: string; host?: string;
  /** Where signing in leads, in plain words. */
  resume?: ReactNode;
  /** Preview fixtures only; the real page reads the server switches. */
  emailReady?: boolean; codeReady?: boolean; initialStatus?: "idle" | "sent"; mode?: "light" | "dark";
}) {
  const ready = emailReady ?? authEmailReady();
  const code = ready && (codeReady ?? authEmailCodeReady());
  const branded = Boolean(brand);
  return <XaEntryFrame brand={brand} brandFontFamily={brandFontFamily} mode={mode} phoneArt="resting"
    end={host ? <span>{host}</span> : <XaTextLink href="/workspace?view=help">Help</XaTextLink>}
    felt={<XaEntryFelt pose="resting" title={branded ? "Same account as strelva.com." : "One sign-in for everything you run."}>
      {branded ? "Your agency works inside your business on Strelva. You decide what goes live." : "Owners and agencies sign in the same way. What opens depends on who added you."}
    </XaEntryFelt>}
    footnote={branded ? "Runs on Strelva." : undefined}>
    <AuthDocumentTitle title={title} />
    {children}
    {failed ? <div role="alert"><XaSays>Sign-in didn’t finish. Try again and you’ll go back to what you were opening.</XaSays></div> : null}
    <SupabaseSignIn emailReady={ready} codeReady={code} next={next} prefillEmail={prefillEmail} resume={resume} initialStatus={initialStatus}
      heading={<XaHeadline quiet={description}>{title}</XaHeadline>} />
    <XaEntryNote>New here? <XaTextLink href={`/sign-up?next=${encodeURIComponent(next)}`}>Make an account</XaTextLink></XaEntryNote>
  </XaEntryFrame>;
}
