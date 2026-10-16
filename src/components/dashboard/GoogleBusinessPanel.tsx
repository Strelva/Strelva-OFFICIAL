"use client";

import { XaAnswers, XaButtonLink, XaLabel, XaLines, XaSays, XaSystemTile } from "@/components/ui/strelva/Xa";
import { StoreChatButton } from "./StoreChatButton";
import { DashNote, DashPage } from "./xa/DashboardXa";
import styles from "./website-xa.module.css";
import { useDashboard } from "./DashboardContext";
import type { GbpState } from "@/lib/gbp-management";

const WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const DAY_LABEL: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday",
  FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
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
        <XaSays>Connecting asks Google once for your listing, what people search, and who visits your site. Nothing posts until you say yes.</XaSays>
      </DashPage>
    );
  }

  const periods = state?.regularHours?.periods ?? [];
  const posts = state?.recentPosts ?? [];
  // Every day of the week, in order. A day with no opening period is Closed.
  const week = WEEK.map((day) => ({ day, periods: periods.filter((p) => p.openDay === day) }));
  const verdict = periods.length
    ? "Your hours are set, and Strelva keeps them in step with your site."
    : "Add your hours so people know when you're open.";
  const hoursPrompt = "Change my opening hours on Google and on my website. Here are the new hours:";

  return (
    <DashPage
      title="Your Google listing."
      quiet={verdict}
      lead={<XaSystemTile kind="listing" size={48} label="Google listing" />}
      label="Google listing"
    >
      {!state ? <DashNote tone="down" role="status">Google didn&apos;t answer just now, so this shows nothing new. Your listing itself is unchanged.</DashNote> : null}
      <div className={styles.split}>
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="gbp-hours">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <XaLabel id="gbp-hours">Hours people see on Google</XaLabel>
            <StoreChatButton prompt={hoursPrompt} label="Change hours" />
          </div>
          {periods.length ? (
            <ul className={styles.hours} aria-label="Hours on Google">
              {week.map(({ day, periods: open }) => (
                <li key={day}><span>{DAY_LABEL[day]}</span><span className="tabular-nums">{open.length ? open.map((p) => `${fmtTime(p.openTime)} to ${fmtTime(p.closeTime)}`).join(", ") : "Closed"}</span></li>
              ))}
            </ul>
          ) : (
            <p className={styles.quiet}>No hours on Google yet. Change hours and Strelva writes them up; they go live after your yes.</p>
          )}
        </section>
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
          <XaSays>Every change to your listing waits on Home. Nothing reaches Google without your yes.</XaSays>
        </section>
      </div>
    </DashPage>
  );
}
