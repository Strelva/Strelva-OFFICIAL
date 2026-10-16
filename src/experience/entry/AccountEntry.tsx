/**
 * After sign-in, before a workspace (XA, designed from B2 "which business"):
 * which business to open, what to do when this email has none, and what to
 * do when it is not one of this business's people. Server-safe views; the
 * routes keep every membership, invite and redirect decision.
 */
import type { ReactNode } from "react";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
import { XaHeadline, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryStack } from "@/components/ui/strelva/xa/entry";

/** Strelva's own support door. Platform support, never one person's inbox. */
export const STRELVA_SUPPORT_EMAIL = "hello@strelva.com";

export interface AccountBusiness {
  id: string; name: string; href: string;
  /** What the business is known by: its public website, when it has one. */
  site?: string | null;
  /** How many things wait for this person there, when known. Shown only when above zero. */
  waiting?: number;
}

function siteHost(site: string | null | undefined): string | null {
  if (!site) return null;
  try { return new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).host.replace(/^www\./, ""); } catch { return site; }
}

/** Several businesses use this email: pick one. The whole row opens it; each opens only its own records. */
export function AccountPicker({ businesses, email, mode }: { businesses: readonly AccountBusiness[]; email?: string | null; mode?: "light" | "dark" }) {
  const waiting = businesses.filter(business => (business.waiting ?? 0) > 0);
  return <XaEntryFrame mode={mode} end={email ? <span>{email}</span> : undefined}
    phoneSays={waiting.length === 1 ? `${waiting[0]!.name} has something waiting for you.` : undefined}
    felt={<XaEntryFelt pose="lineup" title={waiting.length === 1 ? `${waiting[0]!.name} has something waiting for you.` : "Each business keeps its own records."}>
      Opening one never shows another business’s work, people or customers.
    </XaEntryFelt>}>
    <XaHeadline quiet={email ? `${businesses.length} businesses use ${email}.` : `${businesses.length} businesses use this email.`}>Which business do you want to open?</XaHeadline>
    <XaRows label="Your businesses">
      {businesses.map(business => {
        const host = siteHost(business.site);
        const count = business.waiting ?? 0;
        return <XaRow key={business.id} href={business.href} title={business.name}
          detail={count > 0 ? `Needs you: ${count}` : host ?? "No public website yet"} tone={count > 0 ? "waits" : undefined}
          meta={count > 0 && host ? host : undefined} />;
      })}
    </XaRows>
    <XaEntryNote>Missing one? It was shared with a different address. <XaTextLink href="/sign-in">Sign in with that email</XaTextLink></XaEntryNote>
  </XaEntryFrame>;
}

/** Signed in, but no business has added this email yet. */
export function AccountNoBusiness({ email, mode }: { email?: string | null; mode?: "light" | "dark" }) {
  return <XaEntryFrame mode={mode} end={email ? <span>{email}</span> : undefined}
    phoneSays="Invitations open only for the address they went to."
    felt={<XaEntryFelt pose="waving" title="Invitations open only for the address they went to.">Starting your own business instead? Bring what you already have: your website, your Google listing, your tools.</XaEntryFelt>}>
    <XaHeadline quiet="Sign in with the address the invitation went to.">{email ? `${email} isn’t on a business yet.` : "This email isn’t on a business yet."}</XaHeadline>
    <XaEntryStack gap="sm">
      <UseInvitedEmailButton>Sign out and use my invited email</UseInvitedEmailButton>
    </XaEntryStack>
    <XaEntryNote>Starting fresh? <XaTextLink href="/sign-up">Make an account for your business</XaTextLink> or <XaTextLink href="/agencies">find an agency</XaTextLink>.</XaEntryNote>
    <XaEntryNote>Still stuck? <a href={`mailto:${STRELVA_SUPPORT_EMAIL}`}>Email Strelva support</a> and say which business invited you.</XaEntryNote>
  </XaEntryFrame>;
}

/** Signed in, but not one of this business's people. The business decides; this page only says how to fix it. */
export function NoAccessView({ businessName, brand, signInHref = "/sign-in", help, mode }: { businessName?: string; brand?: OwnerBrand; signInHref?: string; help?: ReactNode; mode?: "light" | "dark" }) {
  const name = businessName || "this business";
  const agency = brand?.agencyId ? brand : null;
  const holder = businessName || "The business";
  return <XaEntryFrame brand={brand} businessName={businessName} mode={mode}
    end={<XaTextLink href="/account">Your businesses</XaTextLink>}
    phoneSays={`${holder} decides who can open it.`}
    felt={<XaEntryFelt pose="waving" title={`${holder} decides who can open it.`}>
      The owner adds people and chooses what each can do.{agency ? ` ${agency.name} sees only the clients that added it.` : ""}
    </XaEntryFelt>}>
    <XaHeadline quiet="Sign in with the address your invitation went to.">You don’t have access to {name}.</XaHeadline>
    <XaEntryStack gap="sm">
      <UseInvitedEmailButton redirectUrl={signInHref}>Sign out and use my invited email</UseInvitedEmailButton>
    </XaEntryStack>
    <XaEntryNote><XaTextLink href="/account">Choose another business</XaTextLink></XaEntryNote>
    <XaEntryNote>{help ?? (agency?.replyTo ? <>Not sure which email {name} used? <a href={`mailto:${agency.replyTo}`}>Email {agency.name}</a>.</> : <>Not sure which email was invited? <a href={`mailto:${STRELVA_SUPPORT_EMAIL}`}>Email Strelva support</a>.</>)}</XaEntryNote>
  </XaEntryFrame>;
}

