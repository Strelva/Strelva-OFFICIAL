import type { Member } from "@/lib/rewards/types";
import { XaInitial } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashPage } from "./xa/DashboardXa";
import styles from "./xa/dashboard-xa.module.css";

/**
 * Read-only members surface. The page decides which state to render:
 *  - not configured (KV off / feature not wired) -> honest "not on yet" state
 *  - configured + members    -> the list with a plain count
 *  - configured + no members -> honest empty state
 * Adding members and adjusting points is a separate, deferred build.
 */
type MembersPanelProps =
  | { configured: false }
  | { configured: true; members: Member[] };

const TIER_LABEL: Record<Member["tier"], string> = {
  snapper: "Member",
  "super-snapper": "Top member",
};

export function MembersPanel(props: MembersPanelProps) {
  if (!props.configured) {
    return (
      <DashEmpty
        pose="alone"
        title="Membership isn't on for your site."
        job="Nothing is collecting points yet"
      >
        To reward repeat customers with points and perks, ask Strelva to turn membership on. Nothing changes on your site until you say yes.
      </DashEmpty>
    );
  }

  const { members } = props;

  if (members.length === 0) {
    return (
      <DashEmpty pose="resting" title="No members yet." job="Waiting for the first customer to join">
        Each member and their points appear here as they join and earn.
      </DashEmpty>
    );
  }

  const pointsAwarded = members.reduce((sum, m) => sum + m.starsLifetime, 0);

  return (
    <DashPage
      title="Members."
      quiet={`${members.length} ${members.length === 1 ? "member has" : "members have"} earned ${pointsAwarded.toLocaleString()} points.`}
      label="Members"
    >
      <ul className={styles.list} aria-label="Members">
        {members.map((member) => {
          const name = member.displayName?.trim() || member.email;
          return (
            <li key={member.email}>
              <XaInitial name={name} shape="round" size={30} />
              <div className={styles.listText}>
                <span className={styles.listTitle}>{name}</span>
                {member.displayName?.trim() ? <span className={styles.listDetail}>{member.email}</span> : null}
              </div>
              <div className={styles.listEnd}>
                <span>{member.starsAvailable.toLocaleString()} points</span>
                {member.tier === "super-snapper" ? <span>{TIER_LABEL[member.tier]}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </DashPage>
  );
}
