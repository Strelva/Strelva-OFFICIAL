import { SelectInput } from "@/components/ui/TextInput";
import { StMono, StNotice, StPill, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "@/experience/publishing/publishing.module.css";

/**
 * Search Console and Analytics, read only, through their own Google grant.
 * The owner connects (possibly with a different Google account than the
 * listing), picks a site and a property, and can disconnect it alone.
 * Everyone in the business reads the 28-day summary. Nothing here writes to Google.
 */
type Action = (form: FormData) => Promise<void>;
export interface GoogleReadGrantProps {
  workspaceId: string;
  owner: boolean;
  view: { connected: boolean; googleEmail: string | null; gsc: { granted: boolean; property: string | null }; ga4: { granted: boolean; property: string | null } };
  properties?: { gsc: Array<{ id: string; label: string }> | null; ga4: Array<{ id: string; label: string; detail?: string }> | null } | null;
  summary?: {
    gsc: { status: "ok"; totals: { clicks: number; impressions: number; position: number } } | { status: "unconfigured" | "unavailable" };
    ga4: { status: "ok"; report: { users: number; sessions: number; pageviews: number } } | { status: "unconfigured" | "unavailable" };
  } | null;
  result?: string;
  actions: { start: Action; choose: Action; disconnect: Action };
}

const RESULTS: Record<string, { text: string; tone?: "critical" }> = {
  connected: { text: "Search Console and Analytics are connected, read only. Choose what this business reads." },
  chosen: { text: "Saved. Numbers below read from it." },
  revoked: { text: "Disconnected. Strelva no longer reads Search Console or Analytics. Your Google listing connection is unchanged." },
  revoked_locally: { text: "Disconnected here. Google didn't confirm the revoke; you can also remove Strelva in your Google account's security settings." },
  refused: { text: "Google didn't grant read access to Search Console or Analytics. Nothing was saved.", tone: "critical" },
  cancelled: { text: "Google sign-in was cancelled. Nothing changed." },
  unavailable: { text: "Connecting Search Console and Analytics isn't available right now. Nothing changed.", tone: "critical" },
  failed: { text: "That didn't work. Nothing changed. Try again.", tone: "critical" },
};
const count = (value: number) => new Intl.NumberFormat("en-US").format(value);

export function GoogleReadGrant({ workspaceId, owner, view, properties, summary, result, actions }: GoogleReadGrantProps) {
  const hidden = <input type="hidden" name="workspaceId" value={workspaceId} />;
  const message = result ? RESULTS[result] : undefined;
  return <StSection title="Search Console and Analytics" meta="Read only" action={owner && view.connected ? <form action={actions.disconnect}>{hidden}<StTextButton type="submit" tone="danger">Disconnect</StTextButton></form> : undefined}>
    {message ? <StNotice tone={message.tone}><p role="status" className={styles.copy}>{message.text}</p></StNotice> : null}
    {!view.connected ? owner ? <>
      <p className={styles.copy}>See how people find your site in Google Search and what they do on it. This is its own read-only Google sign-in, separate from your listing. Use whichever Google account has Search Console or Analytics; it can be your web person&apos;s.</p>
      <form action={actions.start}>{hidden}<StPill variant="soft" type="submit">Connect Search Console and Analytics</StPill></form>
    </> : <p className={styles.copy}>Not connected. The business owner connects Search Console and Analytics.</p> : <>
      <p className={styles.copy}>Connected with {view.googleEmail}. Strelva can read; it can&apos;t change anything in Search Console or Analytics.</p>
      {owner && properties ? <form action={actions.choose} className={styles.stack}>{hidden}
        {view.gsc.granted ? properties.gsc?.length ? <SelectInput label="Search Console site" name="gscProperty" defaultValue={view.gsc.property ?? ""} options={[{ value: "", label: "Choose a site" }, ...properties.gsc.map(item => ({ value: item.id, label: item.label }))]} /> : <p className={styles.copy}>This Google account has no Search Console sites.</p> : <p className={styles.copy}>Search Console wasn&apos;t granted.</p>}
        {view.ga4.granted ? properties.ga4?.length ? <SelectInput label="Analytics property" name="ga4Property" defaultValue={view.ga4.property ?? ""} options={[{ value: "", label: "Choose a property" }, ...properties.ga4.map(item => ({ value: item.id, label: item.detail ? `${item.label} · ${item.detail}` : item.label }))]} /> : <p className={styles.copy}>This Google account has no Analytics properties.</p> : <p className={styles.copy}>Analytics wasn&apos;t granted.</p>}
        {properties.gsc?.length || properties.ga4?.length ? <div><StPill variant="soft" type="submit">Save choice</StPill></div> : null}
      </form> : null}
      {summary ? <StRows label="Last 28 days">
        <StRow title="Google Search" detail={summary.gsc.status === "ok" ? <><StMono>{count(summary.gsc.totals.clicks)}</StMono> clicks from <StMono>{count(summary.gsc.totals.impressions)}</StMono> appearances · average position <StMono>{summary.gsc.totals.position}</StMono></> : summary.gsc.status === "unconfigured" ? "No Search Console site chosen yet." : "Couldn't be read right now. The connection is kept."} />
        <StRow title="Visitors" detail={summary.ga4.status === "ok" ? <><StMono>{count(summary.ga4.report.users)}</StMono> people · <StMono>{count(summary.ga4.report.sessions)}</StMono> visits · <StMono>{count(summary.ga4.report.pageviews)}</StMono> page views</> : summary.ga4.status === "unconfigured" ? "No Analytics property chosen yet." : "Couldn't be read right now. The connection is kept."} />
      </StRows> : null}
    </>}
  </StSection>;
}
