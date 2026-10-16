import Link from "next/link";
import { SupabaseSignIn, type SupabaseSignInInitial } from "@/components/auth/SupabaseSignIn";
import { XaButtonLink, XaEntry, XaEntryDoors, XaHeadline, XaLede, XaTextLink } from "@/components/ui/strelva/Xa";

/**
 * The open door on /sign-up (XA · B1, and A1 for agencies): which door, then
 * the account. Nothing here grants access; the next step checks it.
 */
export function SignUpDoor({ next, asAgency, doors, requestedNext, identityName, brand, emailReady, mode, initial, prefillEmail }: {
  /** Where sign-in returns: business setup, agency start, or an invitation. */
  next: string;
  asAgency: boolean;
  /** Both doors are open, so the person picks one. */
  doors: boolean;
  requestedNext: string | null;
  /** The business an invitation is for. */
  identityName?: string | null;
  /** The agency behind an invitation or claim; its name stands in for Strelva's. */
  brand?: string | { name: string; logoUrl?: string | null };
  emailReady: boolean;
  mode?: "light" | "dark";
  prefillEmail?: string;
  /** Preview only: open in the sent or failed state. */
  initial?: SupabaseSignInInitial;
}) {
  const signInHref = `/sign-in?next=${encodeURIComponent(next)}`;
  const shown = typeof brand === "string" ? { name: brand } : brand;
  return <XaEntry mode={mode} brand={shown} account={<Link href={signInHref}>Sign in</Link>} foot={identityName || shown ? "Runs on Strelva. Same account as strelva.com." : undefined}
    stage={asAgency
      ? { pose: "lineup", label: "Pebble beside a row of client Systems", title: "Every client, in its own workspace.", body: "Clients own their workspace; you work inside it. Nothing goes live without their yes.", phone: "Clients own their workspace. Nothing goes live without their yes." }
      : { pose: "alone", label: "Pebble, ready to start", title: identityName ? `${identityName}, on Strelva.` : "Your business, on Strelva.", body: "You own it and everything in it. An agency can work inside it, and nothing goes live without your yes.", phone: "You own it and everything in it. Nothing goes live without your yes." }}>
    <SupabaseSignIn emailReady={emailReady} key={next} next={next} emailLabel="Work email" initial={initial} prefillEmail={prefillEmail} heading={<>
      <XaHeadline quiet={asAgency ? "Use the account your agency works from." : "Use the account you run the business with."}>{identityName ? `Create access for ${identityName}.` : "Make your Strelva account."}</XaHeadline>
      {doors ? <AccountKindChoice selected={asAgency ? "agency" : "business"} next={requestedNext} /> : null}
    </>} />
  </XaEntry>;
}

/** /sign-up while the business door is closed: the free check, an agency, or sign in. */
export function SignUpClosed({ agencyDoor, mode }: { agencyDoor: boolean; mode?: "light" | "dark" }) {
  return <XaEntry mode={mode} account={<Link href="/sign-in">Sign in</Link>} foot="Invite only for now"
    stage={{ pose: "waving", label: "Pebble waving with a clipboard", title: "Strelva opens to new businesses soon.", body: "Businesses with an invitation, and their agencies, are already in." }}>
    <XaHeadline quiet="Already have access? Sign in with the email connected to your business.">New accounts open soon.</XaHeadline>
    <XaLede>Until then, check your business for free. The check reads your site the way search and assistants do.</XaLede>
    <XaButtonLink href="/audit" variant="primary" size="lg" block>Check your business</XaButtonLink>
    <p className="m-0 flex flex-col gap-2 text-[14px] leading-5 text-[var(--st-text-2)]">
      <span>Want it done for you? <XaTextLink href="/agencies">Find an agency</XaTextLink></span>
      {agencyDoor ? <span>Build for clients? <XaTextLink href="/sign-up?as=agency">Create an agency account</XaTextLink></span> : null}
    </p>
  </XaEntry>;
}

function AccountKindChoice({ selected, next }: { selected: "business" | "agency"; next: string | null }) {
  const href = (kind: "business" | "agency") => {
    const query = new URLSearchParams();
    if (kind === "agency") query.set("as", "agency");
    else if (next) query.set("next", next);
    return query.size ? `/sign-up?${query}` : "/sign-up";
  };
  return <XaEntryDoors label="Who is this for?" options={[
    { href: href("business"), label: "Use it yourself", current: selected === "business" },
    { href: href("agency"), label: "Run it for others", current: selected === "agency" },
  ]} />;
}
