import { XaHeadline, XaPage, XaRow, XaRows, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";

type InitialFeedback = { state: "idle" | "submitting" | "success" | "error"; message?: string; email?: string; statusUrl?: string };
type Carried = { businessName?: string; currentWebsite?: string; scan?: string };

function hostOf(value: string | undefined) {
  if (!value) return undefined;
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host.replace(/^www\./, ""); } catch { return value; }
}

/**
 * The two doors (ADR 0015), designed in XA from B1: use it yourself, run it
 * for others, or bring in an agency. All three are equal rows; none is the
 * default. When a free check sent the person here, its business rides along
 * on the felt and into sign-up. A door that is not open yet says so plainly
 * and offers what works today. There is no waitlist behind this page.
 */
export function AccessRequestPage({ carried, businessOpen = true, agencyOpen = true, mode }: { initialFeedback?: InitialFeedback; carried?: Carried; businessOpen?: boolean; agencyOpen?: boolean; mode?: "light" | "dark" } = {}) {
  const host = hostOf(carried?.currentWebsite);
  const name = carried?.businessName;
  const saved = carried?.scan ? `/workspace?save=${encodeURIComponent(carried.scan)}` : null;
  const businessHref = saved ? `/sign-up?next=${encodeURIComponent(saved)}` : "/sign-up";
  return <XaEntryFrame mode={mode} phoneArt="waving" end={<XaTextLink href="/sign-in">Sign in</XaTextLink>}
    felt={name || host
      ? <XaEntryFelt pose="adds" object={<XaPage address={host ?? "Your website"} title={name ?? host} label="The business from your check"><p className="m-0 text-[15px] leading-normal text-[var(--st-text-2)]">From your free check. It comes with you into a business account, and nothing on the site changes until you say yes.</p></XaPage>} />
      : <XaEntryFelt pose="waving" title="Use it yourself, or have it run for you.">Every agency in the directory is listed the same way. Nothing changes until you choose.</XaEntryFelt>}>
    <XaHeadline quiet={name ? `${name} is ready to come with you.` : "Every way in keeps your business yours."}>How do you want to start?</XaHeadline>
    <XaRows label="Ways to start">
      <XaRow href={businessOpen ? businessHref : undefined} title={name ? `Run ${name} on Strelva` : "Open my business account"}
        detail={businessOpen ? "Run your business yourself. Bring in an agency anytime." : "Already invited to a business? Sign in with that email."}
        meta={businessOpen ? undefined : <XaStatus kind="draft" size="sm">Opens soon</XaStatus>} />
      <XaRow href={agencyOpen ? "/sign-up?as=agency" : undefined} title="Open my agency account"
        detail={agencyOpen ? "Build and run Systems for your clients. Each client owns its workspace." : "Already on an agency team? Sign in with that email."}
        meta={agencyOpen ? undefined : <XaStatus kind="draft" size="sm">Opens soon</XaStatus>} />
      <XaRow href="/agencies" title="Find an agency" detail="Choose from the agency directory, then sign in to send your request." />
    </XaRows>
    <XaEntryNote>A request becomes agreed work after scope and timing are confirmed.</XaEntryNote>
  </XaEntryFrame>;
}
