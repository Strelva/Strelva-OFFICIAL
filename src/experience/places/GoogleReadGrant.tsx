import { XaButton, XaSays } from "@/components/ui/strelva/Xa";
import styles from "@/experience/connections/xa-connections.module.css";

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
  const n = (value: number) => <span className={styles.figure}>{count(value)}</span>;
  return <section className={styles.section} aria-labelledby="google-read-grant">
    <div className={styles.sectionHead}><h2 id="google-read-grant" className={styles.sectionTitle}>Search Console and Analytics</h2>
      <span className={styles.actions}><span className={styles.sectionMeta}>Read only</span>{owner && view.connected ? <form action={actions.disconnect}>{hidden}<button type="submit" className={styles.danger}>Disconnect</button></form> : null}</span></div>
    {message ? <div role="status"><XaSays>{message.text}</XaSays></div> : null}
    {!view.connected ? owner ? <>
      <p className={styles.quiet}>See how people find your site in Google Search and what they do on it. This is its own read-only Google sign-in, separate from your listing. Use whichever Google account has Search Console or Analytics; it can be your web person&apos;s.</p>
      <form action={actions.start}>{hidden}<XaButton size="sm" type="submit">Connect Search Console and Analytics</XaButton></form>
    </> : <p className={styles.quiet}>Not connected. The business owner connects Search Console and Analytics.</p> : <>
      <p className={styles.quiet}>Connected with {view.googleEmail}. Strelva can read; it can&apos;t change anything in Search Console or Analytics.</p>
      {summary ? <ul className={styles.group} aria-label="Last 28 days">
        <li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupTitle}>Google Search, last 28 days</span><span className={styles.groupDetail}>{summary.gsc.status === "ok" ? <>{n(summary.gsc.totals.clicks)} clicks from {n(summary.gsc.totals.impressions)} appearances · average position {n(summary.gsc.totals.position)}</> : summary.gsc.status === "unconfigured" ? "No Search Console site chosen yet." : "Couldn't be read right now. The connection is kept."}</span></span></li>
        <li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupTitle}>Visitors, last 28 days</span><span className={styles.groupDetail}>{summary.ga4.status === "ok" ? <>{n(summary.ga4.report.users)} people · {n(summary.ga4.report.sessions)} visits · {n(summary.ga4.report.pageviews)} page views</> : summary.ga4.status === "unconfigured" ? "No Analytics property chosen yet." : "Couldn't be read right now. The connection is kept."}</span></span></li>
      </ul> : null}
      {owner && properties ? <form action={actions.choose} className={styles.section}>{hidden}
        {view.gsc.granted ? properties.gsc?.length ? <label className={styles.fieldLabel}>Search Console site<select className={styles.select} name="gscProperty" defaultValue={view.gsc.property ?? ""}><option value="">Choose a site</option>{properties.gsc.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <p className={styles.small}>This Google account has no Search Console sites.</p> : <p className={styles.small}>Search Console wasn&apos;t granted.</p>}
        {view.ga4.granted ? properties.ga4?.length ? <label className={styles.fieldLabel}>Analytics property<select className={styles.select} name="ga4Property" defaultValue={view.ga4.property ?? ""}><option value="">Choose a property</option>{properties.ga4.map(item => <option key={item.id} value={item.id}>{item.detail ? `${item.label} · ${item.detail}` : item.label}</option>)}</select></label> : <p className={styles.small}>This Google account has no Analytics properties.</p> : <p className={styles.small}>Analytics wasn&apos;t granted.</p>}
        {properties.gsc?.length || properties.ga4?.length ? <div><XaButton size="sm" type="submit">Save choice</XaButton></div> : null}
      </form> : null}
    </>}
  </section>;
}
