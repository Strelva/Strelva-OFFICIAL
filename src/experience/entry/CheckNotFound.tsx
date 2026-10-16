import { XaButtonLink, XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryBrokenLink, XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";

/**
 * A saved check link that no longer opens: it expired, was mistyped, or
 * never existed. The felt holds the broken link with Pebble beside it; the
 * one way forward is to run the check again. Nothing private is shown.
 */
export function CheckNotFound({ mode }: { mode?: "light" | "dark" }) {
  return <XaEntryFrame mode={mode} label="Business check not found"
    end={<XaTextLink href="/sign-in">Sign in</XaTextLink>}
    phoneSays="This link doesn’t open anymore. A new check takes about a minute."
    felt={<XaEntryFelt object={<XaEntryBrokenLink address="Your shared check" title="This check doesn’t open anymore.">Shared checks last about six months. A new one reads the site as it is today.</XaEntryBrokenLink>} />}>
    <XaHeadline quiet="The link may have expired or been copied only in part.">Business check not found.</XaHeadline>
    <XaButtonLink href="/audit" variant="primary" size="lg" block>Run the check again</XaButtonLink>
    <XaEntryNote>Saved it to your workspace before? Your copy is still there. <XaTextLink href="/workspace">Open your workspace</XaTextLink></XaEntryNote>
  </XaEntryFrame>;
}
