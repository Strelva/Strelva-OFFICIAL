/** Fictional canon content for Versions, a Calendar Connection and a read-only
 * Store Connection. These examples do not establish provider access, sent
 * reminders, actual reads/writes or a Square integration. */
import type { ConnectionDetailData } from "@/experience/systems/ConnectionDetail";
import type { ComparedVersion, VersionDifference, VersionImprovementOffer } from "@/experience/systems/VersionComparison";
import type { StoreOrderRead } from "@/experience/systems/StoreConnection";

export const calendarConnectionFixture: ConnectionDetailData = {
  name: "Google Calendar · Sheri — Work", systemName: "Mediation sessions", systemHref: "/preview/strelva/sessions", status: "connected",
  direction: "Strelva reads busy times. Strelva writes confirmed sessions, nothing else.",
  authority: "sheri@example.test on Oct 6 · Google account access · you can revoke in Google too",
  source: "1 calendar: Sheri — Work. Personal calendars are not read.",
  freshness: "Read 3 min ago · every 5 min",
  failureBehavior: "After 15 min without an answer from Google, Strelva stops offering dates and tells you.",
  recent: [
    { id: "read-1", kind: "read", sentence: "Strelva read busy times · 41 events", at: "2:58" },
    { id: "read-2", kind: "read", sentence: "Strelva read busy times · 41 events", at: "2:53" },
    { id: "write-1", kind: "write", sentence: "Strelva wrote “Mediation · Harbor & Lane”", at: "Wed" },
    { id: "notice-1", kind: "notice", sentence: "Google asked to allow again", at: "Oct 6" },
  ],
};

export const appointmentsVersionsFixture: readonly ComparedVersion[] = [
  { id: "downtown", name: "Downtown", release: "Release 12", state: "live", stateLabel: "Live" },
  { id: "amherst", name: "Amherst", release: "Release 12 + 1 local change", state: "live", stateLabel: "Live" },
];
export const appointmentsDifferencesFixture: readonly VersionDifference[] = [
  { id: "hours", label: "Hours", source: "From the business record", values: [{ versionId: "downtown", value: "Mon–Fri 8–5" }, { versionId: "amherst", value: "Mon–Thu 7–6, Sat 8–12" }] },
  { id: "services", label: "Services offered", source: "From the business record", values: [{ versionId: "downtown", value: "Cleaning, fillings, crowns, whitening" }, { versionId: "amherst", value: "Cleaning, fillings, children’s visits" }] },
  { id: "reminder", label: "Reminder text", source: "Changed at Amherst on Sep 30", values: [{ versionId: "downtown", value: "Standard" }, { versionId: "amherst", value: "“Bring your insurance card. Park on Main St.”", locallyChanged: true }] },
  { id: "notice", label: "Booking notice", source: "Same everywhere", values: [{ versionId: "downtown", value: "24 hours" }, { versionId: "amherst", value: "24 hours" }] },
];
export const appointmentsOfferFixture: VersionImprovementOffer = {
  title: "North Studio offers release 13: reminders also go out by text message",
  versions: [
    { versionId: "downtown", sentence: "Downtown: ready. Nothing local to keep.", conflicting: false },
    { versionId: "amherst", sentence: "Amherst: your reminder text stays. Release 13 adds the text message around it.", conflicting: true },
  ],
  explanation: "Each location gets its own Needs you item. Nothing changes until you say yes.",
};

export const storeOrdersFixture: readonly StoreOrderRead[] = [
  { id: "order-1042", number: "#1042", description: "10-class pack · A. Ruiz", amount: "[amount]", status: "Paid", at: "2:10 PM" },
  { id: "order-1041", number: "#1041", description: "Drop-in · K. Moss", amount: "[amount]", status: "Paid", at: "9:02 AM" },
  { id: "order-1040", number: "#1040", description: "Gift card · J. Park", amount: "[amount]", status: "Refunded in Square", at: "Wed" },
  { id: "order-1039", number: "#1039", description: "Monthly unlimited · T. Ellis", amount: "[amount]", status: "Paid", at: "Wed" },
];

export const SYSTEM_DETAIL_STATES = ["ready", "loading", "error", "empty", "permission"] as const;
export type SystemDetailFixtureState = typeof SYSTEM_DETAIL_STATES[number];
export function systemDetailFixtureState(value?: string): SystemDetailFixtureState {
  return SYSTEM_DETAIL_STATES.includes(value as SystemDetailFixtureState) ? value as SystemDetailFixtureState : "ready";
}
