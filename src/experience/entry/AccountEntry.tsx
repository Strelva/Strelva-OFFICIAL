/**
 * After sign-in, before a workspace (XA, designed from B2 "which business"):
 * which business to open, what to do when this email has none, and what to
 * do when it is not one of this business's people. Server-safe views; the
 * routes keep every membership, invite and redirect decision.
 */
import type { ReactNode } from "react";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { UseInvitedEmailButton } from "@/components/auth/UseInvitedEmailButton";
import { XaHeadline, XaInitial, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryStack } from "@/components/ui/strelva/xa/entry";

export interface AccountBusiness { id: string; name: string; host: string; href: string }

/** Several businesses use this email: pick one. Each opens only its own records. */
export function AccountPicker({ businesses, email, mode }: { businesses: readonly AccountBusiness[]; email?: string; mode?: "light" | "dark" }) {
  return <XaEntryFrame mode={mode} phoneArt="lineup" end={email ? <span>{email}</span> : undefined}
    felt={<XaEntryFelt pose="lineup" title="Each business keeps its own records.">Opening one never shows another business’s work, people or customers.</XaEntryFelt>}>
    <XaHeadline quiet={`${businesses.length} businesses use this email.`}>Which business do you want to open?</XaHeadline>
    <XaRows label="Your businesses">
      {businesses.map(business => <XaRow key={business.id} href={business.href} lead={<XaInitial name={business.name} size={32} />} title={business.name} detail={business.host} meta="Open" />)}
    </XaRows>
    <XaEntryNote>Missing one? It was shared with a different address. <XaTextLink href="/sign-in">Sign in with that email</XaTextLink></XaEntryNote>
  </XaEntryFrame>;
}

/** Signed in, but no business has added this email yet. */
export function AccountNoBusiness({ mode }: { mode?: "light" | "dark" }) {
  return <XaEntryFrame mode={mode} phoneArt="waving"
    felt={<XaEntryFelt pose="waving" title="Starting your own business on Strelva?">Make an account and bring what you already have: your website, your Google listing, your tools.</XaEntryFelt>}>
    <XaHeadline quiet="An invitation opens only for the address it went to.">This email isn’t on a business yet.</XaHeadline>
    <XaSays>Use the exact email address that received your invite. The button below signs you out so you can choose that account.</XaSays>
    <XaEntryStack gap="sm">
      <UseInvitedEmailButton />
    </XaEntryStack>
    <XaEntryNote>Starting fresh? <XaTextLink href="/sign-up">Make an account for your business</XaTextLink> or <XaTextLink href="/agencies">find an agency</XaTextLink>. Still stuck? Write to <a href="mailto:jacob@strelva.com">jacob@strelva.com</a> and we’ll connect the right account.</XaEntryNote>
  </XaEntryFrame>;
}

/** Signed in, but not one of this business's people. The business decides; this page only says how to fix it. */
export function NoAccessView({ businessName, brand, signInHref = "/sign-in", help, mode }: { businessName?: string; brand?: OwnerBrand; signInHref?: string; help?: ReactNode; mode?: "light" | "dark" }) {
  const name = businessName || "this business";
  const agency = brand?.agencyId ? brand.name : null;
  return <XaEntryFrame brand={brand} mode={mode} phoneArt="waving"
    end={<XaTextLink href="/account">Your businesses</XaTextLink>}
    felt={<XaEntryFelt pose="waving" title={`${businessName || "The business"} holds the list.`}>The owner adds people and chooses what each can do. An agency sees only the clients that added it.</XaEntryFelt>}
    footnote={agency ? "Same account as strelva.com." : undefined}>
    <XaHeadline quiet={`${businessName || "The business"} decides who can open its workspace.`}>You don’t have access to {name}.</XaHeadline>
    <XaSays>You’re signed in, but this email isn’t a member of this business’s workspace. Use the exact email address that received your invite. The button below signs you out so you can choose that account.</XaSays>
    <XaEntryStack gap="sm">
      <UseInvitedEmailButton redirectUrl={signInHref} />
    </XaEntryStack>
    <XaEntryNote><XaTextLink href="/account">Choose another business</XaTextLink></XaEntryNote>
    <XaEntryNote>{help ?? (brand?.replyTo ? <>Not sure which email {name} used? <a href={`mailto:${brand.replyTo}`}>Ask {brand.name}</a>.</> : <>Need help connecting the right account? Write to <a href="mailto:jacob@strelva.com">jacob@strelva.com</a>.</>)}</XaEntryNote>
  </XaEntryFrame>;
}
