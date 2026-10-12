import type { OwnerBrand } from "@/platform/infra/agency-brand";
import type { ReactNode } from "react";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { AuthDocumentTitle } from "@/components/AuthDocumentTitle";
import { StEntry, StHead, StNotice, StTextButton } from "@/components/ui/strelva/Kit";

export function WorkspaceSignIn({ next = "/workspace", failed = false, title = "Sign in", description = "Use the email connected to your Strelva account.", prefillEmail = "", children, brand, brandFontFamily, host }: { next?: string; failed?: boolean; title?: string; description?: string; prefillEmail?: string; children?: ReactNode; brand?: ReactNode | OwnerBrand; brandFontFamily?: string; host?: string }) {
  return <StEntry brand={brand} brandFontFamily={brandFontFamily} host={host} helpHref="/workspace?view=help">
    <AuthDocumentTitle title={title} />
    {children}
    {failed ? <StNotice tone="critical">Sign-in did not complete. Try again to return to your saved work.</StNotice> : null}
    <SupabaseSignIn next={next} prefillEmail={prefillEmail} heading={<StHead title={title} meta={description} />} />
    {brand ? <p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p> : null}
    <StTextButton href={`/sign-up?next=${encodeURIComponent(next)}`}>New here? Create an account</StTextButton>
  </StEntry>;
}
