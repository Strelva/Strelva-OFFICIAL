import { XaButtonLink, XaHeadline, XaPage, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryPebbleLine } from "@/components/ui/strelva/xa/entry";

type InitialFeedback = { state: "idle" | "submitting" | "success" | "error"; message?: string; email?: string; statusUrl?: string };
type Carried = { businessName?: string; currentWebsite?: string; scan?: string };

function hostOf(value: string | undefined) {
  if (!value) return undefined;
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host.replace(/^www\./, ""); } catch { return value; }
}

/** A door that isn't open yet: what happens, and the one thing that works today. Not a link. */
function ClosedDoor({ title }: { title: string }) {
  return <XaRow title={title} detail={<>Opens soon. Already invited? <XaTextLink href="/sign-in">Sign in</XaTextLink>.</>} />;
}

/**
 * The two doors (ADR 0015), designed in XA from B1: use it yourself, run it
 * for others, or bring in an agency. Each open door names what clicking does.
 * With no check behind the visit, the three are equal rows and none is the
 * default. When a free check sent the person here, its business rides along
 * on the felt and its account is the one ink pill. A closed door says so in
 * one line, is not a link, and offers sign-in. There is no waitlist: nothing
 * on this page is saved, and the page says so when a door is closed.
 */
export function AccessRequestPage({ carried, businessOpen = true, agencyOpen = true, mode }: { initialFeedback?: InitialFeedback; carried?: Carried; businessOpen?: boolean; agencyOpen?: boolean; mode?: "light" | "dark" } = {}) {
  const host = hostOf(carried?.currentWebsite);
  const name = carried?.businessName;
  const saved = carried?.scan ? `/workspace?save=${encodeURIComponent(carried.scan)}` : null;
  const businessHref = saved ? `/sign-up?next=${encodeURIComponent(saved)}` : "/sign-up";
  const lead = Boolean(name || host) && businessOpen;
  const sentence = lead ? `${name ?? host} and its check come with you.` : "Pick the one that fits. You can bring in an agency later.";
  return <XaEntryFrame mode={mode} end={<XaTextLink href="/sign-in">Sign in</XaTextLink>}
    phoneSays={lead ? sentence : undefined}
    felt={name || host
      ? <XaEntryFelt object={<>
        <XaPage address={host ?? "Your website"} title={name ?? host} label="The business from your check">
          <p className="m-0 text-[15px] leading-normal text-[var(--st-text-2)]">From your free check. Nothing on the site changes until you say yes.</p>
        </XaPage>
        <div className="mt-5"><XaEntryPebbleLine>{businessOpen ? sentence : "Business accounts open soon. Your check stays at its link until then."}</XaEntryPebbleLine></div>
      </>} />
      : <XaEntryFelt pose="waving" title="Use it yourself, or have it run for you.">Every agency in the directory is listed the same way. Nothing changes until you choose.</XaEntryFelt>}>
    <XaHeadline quiet={lead ? `${name ?? host} is ready to come with you.` : "Every way in keeps your business yours."}>How do you want to start?</XaHeadline>
    {lead ? <XaButtonLink href={businessHref} variant="primary" size="lg" block>Make {name ? `${name}’s` : "my business"} account</XaButtonLink> : null}
    <XaRows label="Ways to start">
      {lead ? null : businessOpen
        ? <XaRow href={businessHref} title="Make my business account →" detail="Run your business yourself. Bring in an agency anytime." />
        : <ClosedDoor title="Business accounts" />}
      {agencyOpen
        ? <XaRow href="/sign-up?as=agency" title="Make my agency account →" detail="Build and run Systems for your clients. Each client owns its workspace." />
        : <ClosedDoor title="Agency accounts" />}
      <XaRow href="/agencies" title="Find an agency →" detail="See the agency directory, then sign in to send your request." />
    </XaRows>
    {!businessOpen || !agencyOpen ? <XaEntryNote>There’s no waitlist. Nothing on this page is saved.</XaEntryNote>
      : <XaEntryNote>A request becomes agreed work after scope and timing are confirmed.</XaEntryNote>}
  </XaEntryFrame>;
}
