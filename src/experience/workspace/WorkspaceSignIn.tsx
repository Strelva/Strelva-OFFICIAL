import { authEmailCodeReady, authEmailReady } from "@/components/auth/email-readiness";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import type { ReactNode } from "react";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { SignInMailFelt, SignInMailProvider } from "@/components/auth/sign-in-mail";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";

/**
 * Getting back in (XA, designed from B1 and C1). One column of words and one
 * email field. The felt does the page's job: it holds the email Strelva is
 * about to send, carrying the address as it is typed, and shows it arriving.
 * Whoever's door this is (the agency, the business, or Strelva) names itself
 * once in the header. Access is still decided by the destination, never here.
 */
export function WorkspaceSignIn({ next = "/workspace", failed = false, title = "Sign in to your Strelva work.", description = "Use the email you signed up or were invited with.", prefillEmail = "", children, brand, businessName, brandFontFamily, host, resume, emailReady, codeReady, initialStatus, mode }: {
  next?: string; failed?: boolean; title?: string; description?: string; prefillEmail?: string; children?: ReactNode;
  brand?: ReactNode | OwnerBrand; brandFontFamily?: string; host?: string;
  /** The business this door is for; named in the header when no agency brand resolves. */
  businessName?: string;
  /** Where signing in leads, in plain words. */
  resume?: ReactNode;
  /** Preview fixtures only; the real page reads the server switches. */
  emailReady?: boolean; codeReady?: boolean; initialStatus?: "idle" | "sent"; mode?: "light" | "dark";
}) {
  const ready = emailReady ?? authEmailReady();
  const code = ready && (codeReady ?? authEmailCodeReady());
  return <SignInMailProvider initialEmail={prefillEmail} initialStatus={initialStatus}>
    <XaEntryFrame brand={brand} businessName={businessName} brandFontFamily={brandFontFamily} mode={mode}
      phoneSays={failed ? "The last sign-in didn’t finish. A new email starts it over." : undefined}
      end={host ? <span>{host}</span> : <XaTextLink href="/workspace?view=help">Help</XaTextLink>}
      felt={ready ? <XaEntryFelt object={<SignInMailFelt code={code} failed={failed} />} />
        : <XaEntryFelt pose="resting" title="Email sign-in is off on this address.">Google works now. Your work kept running while you were away.</XaEntryFelt>}>
      <AuthDocumentTitle title={title} />
      {children}
      {failed ? <div role="alert"><XaSays>Sign-in didn’t finish. Try again and you’ll go back to what you were opening.</XaSays></div> : null}
      <SupabaseSignIn emailReady={ready} codeReady={code} next={next} prefillEmail={prefillEmail} resume={resume} initialStatus={initialStatus}
        heading={<XaHeadline quiet={description}>{title}</XaHeadline>} />
      <XaEntryNote>New here? <XaTextLink href={`/sign-up?next=${encodeURIComponent(next)}`}>Make an account</XaTextLink></XaEntryNote>
    </XaEntryFrame>
  </SignInMailProvider>;
}
