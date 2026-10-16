import { XaButtonLink, XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";

/**
 * A saved check link that no longer opens: it expired, was mistyped, or
 * never existed. Pebble stays in frame for the bad news and the one way
 * forward is to run the check again. Nothing private is shown either way.
 */
export function CheckNotFound({ mode }: { mode?: "light" | "dark" }) {
  return <XaEntryFrame mode={mode} phoneArt="fixing" label="Business check not found"
    end={<XaTextLink href="/sign-in">Sign in</XaTextLink>}
    felt={<XaEntryFelt pose="fixing" title="Shared checks are kept for about six months.">A new check takes about a minute and reads the site as it is today.</XaEntryFelt>}>
    <XaHeadline quiet="The link may have expired or been copied only in part.">Business check not found.</XaHeadline>
    <XaSays>Run the check again with the same website and business name. If you saved this check to your workspace, your copy is still there.</XaSays>
    <XaButtonLink href="/audit" variant="primary" size="lg" block>Run the check again</XaButtonLink>
    <XaEntryNote>Saved it before? <XaTextLink href="/workspace">Open your workspace</XaTextLink></XaEntryNote>
  </XaEntryFrame>;
}
