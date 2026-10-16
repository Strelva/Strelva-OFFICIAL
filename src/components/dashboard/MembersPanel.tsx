import type { Member } from "@/lib/rewards/types";
import { XaInitial, XaSays } from "@/components/ui/strelva/Xa";
import { StoreChatButton } from "./StoreChatButton";
import { DashEmpty, DashPage } from "./xa/DashboardXa";
import styles from "./xa/dashboard-xa.module.css";

/**
 * Read-only members surface. The page decides which state to render:
 *  - not configured (KV off / feature not wired) -> honest "not on yet" state
 *  - configured + members    -> the list with a plain count
 *  - configured + no members -> honest empty state
 * Adding members is a separate, deferred build. Rewards stay frozen, so no
 * points, tiers or perks appear here.
 */
type MembersPanelProps =
  | { configured: false }
  | { configured: true; members: Member[] };

export function MembersPanel(props: MembersPanelProps) {
  // Rewards are frozen (systems catalog §3.2): no points, tiers or perks are
  // shown or offered until they ship. Members are listed as people who joined.
  if (!props.configured) {
    return (
      <DashEmpty
        pose="alone"
        title="Membership isn't on for your site."
        job="Keeping your site as it is"
      >
        Members and rewards aren&apos;t open yet. Strelva will tell you when they are. Nothing changes on your site until then.
      </DashEmpty>
    );
  }

  const { members } = props;

  if (members.length === 0) {
    return (
      <DashEmpty pose="resting" title="No members yet." job="Waiting for the first customer to join">
        Each member appears here when they join.
      </DashEmpty>
    );
  }

  const joinedAt = (member: Member) => { const at = Date.parse(member.createdAt); return Number.isFinite(at) ? at : null; };
  const joined = (member: Member) => { const at = joinedAt(member); return at === null ? null : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const newest = [...members].sort((a, b) => (joinedAt(b) ?? 0) - (joinedAt(a) ?? 0))[0]!;
  const newestName = newest.displayName?.trim() || newest.email;
  const first = newestName.split(/\s+/)[0] || newestName;

  return (
    <DashPage
      title="Members."
      quiet={`${members.length.toLocaleString()} ${members.length === 1 ? "person has" : "people have"} joined.`}
      label="Members"
    >
      <XaSays links={[<StoreChatButton key="thank" label={`Ask Strelva to write ${first} a thank-you`} prompt={`Write a short, warm thank-you I can send ${newestName}, who just joined as a member.`} />]}>
        {joined(newest) ? `${first} joined most recently, on ${joined(newest)}.` : `${first} is one of your members.`} A note from you brings people back.
      </XaSays>
      <ul className={styles.list} aria-label="Members">
        {members.map((member) => {
          const name = member.displayName?.trim() || member.email;
          return (
            <li key={member.email}>
              <XaInitial name={name} shape="round" size={30} />
              <div className={styles.listText}>
                <span className={styles.listTitle}>{name}</span>
                {joined(member) ? <span className={styles.listDetail}>Joined {joined(member)}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </DashPage>
  );
}
