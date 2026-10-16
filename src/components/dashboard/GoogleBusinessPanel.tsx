"use client";

import { XaAnswers, XaButtonLink, XaLabel, XaLines, XaPage, XaSays, XaStatus, XaSystemTile } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage } from "./xa/DashboardXa";
import styles from "./website-xa.module.css";
import { useDashboard } from "./DashboardContext";
import type { GbpState } from "@/lib/gbp-management";

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

function fmtTime(t?: { hours: number; minutes: number }): string {
  if (!t) return "";
  const h = t.hours % 12 || 12;
  const ampm = t.hours < 12 ? "am" : "pm";
  return t.minutes ? `${h}:${String(t.minutes).padStart(2, "0")}${ampm}` : `${h}${ampm}`;
}

export function GoogleBusinessPanel({ connected, state }: { connected: boolean; state: GbpState | null }) {
  const { dashboardHref } = useDashboard();
  const connectHref = dashboardHref("/dashboard/sources/google-business");

  if (!connected) {
    return (
      <DashPage
        title="Your Google listing isn't connected."
        quiet="One connection keeps your hours, posts and reviews in step with your site."
        lead={<XaSystemTile kind="listing" size={48} label="Google listing" />}
        actions={<XaButtonLink variant="primary" href={connectHref}>Connect your Google listing</XaButtonLink>}
        width="narrow"
        label="Google listing"
      >
        <XaAnswers labelWidth={148} rows={[
          ["Hours", "Change them once. Your site and your listing match."],
          ["Posts", "Updates and offers go to Google after your yes."],
          ["Reviews", "New reviews land here with a reply written in your voice."],
          ["Search", "See how people find you on Google, in your weekly report."],
        ]} />
        <XaSays>Connecting asks Google for your Business Profile, Search Console and Analytics in one step. Nothing posts until you say yes.</XaSays>
      </DashPage>
    );
  }

  const hours = state?.regularHours?.periods ?? [];
  const posts = state?.recentPosts ?? [];
  const verdict = hours.length
    ? "Your hours are set and Strelva keeps them in step with your site."
    : "Add your hours so people know when you're open.";

  return (
    <DashPage
      title="Your Google listing."
      quiet={verdict}
      lead={<XaSystemTile kind="listing" size={48} label="Google listing" />}
      actions={<XaStatus kind="live" breathe>Connected</XaStatus>}
      label="Google listing"
    >
      {!state ? <DashNote tone="down" role="status">Google didn&apos;t answer just now, so this shows nothing new. Your listing itself is unchanged.</DashNote> : null}
      <div className={styles.split}>
        <XaPage address="Google Maps" title="Hours" label="Your hours as people see them on Google" flat>
          {hours.length ? (
            <ul className={styles.hours}>
              {hours.map((p, i) => (
                <li key={i}><span>{DAY_LABEL[p.openDay] ?? p.openDay}</span><span className="tabular-nums">{fmtTime(p.openTime)} to {fmtTime(p.closeTime)}</span></li>
              ))}
            </ul>
          ) : (
            <p className={styles.quiet}>No hours on Google yet. Ask Strelva to add them; they go up after your yes.</p>
          )}
        </XaPage>
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="gbp-posts">
          <XaLabel id="gbp-posts">Recent posts on Google</XaLabel>
          {posts.length ? (
            <XaLines label="Recent posts on Google" lines={posts.map((post) => ({
              time: post.createTime ? new Date(post.createTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
              dateTime: post.createTime,
              text: post.summary || "A post with no words",
            }))} />
          ) : (
            <p className={styles.quiet}>No posts yet. Ask Strelva to write one from a recent update; it posts after your yes.</p>
          )}
          <XaSays>Every change to your listing waits in Needs you. Nothing reaches Google without your yes.</XaSays>
        </section>
      </div>
    </DashPage>
  );
}
