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

  // Who to thank next: the member with the most points waiting to be spent.
  const next = [...members].sort((a, b) => b.starsAvailable - a.starsAvailable)[0]!;
  const nextName = next.displayName?.trim() || next.email;
  const first = nextName.split(/\s+/)[0] || nextName;
  const others = members.length - 1;

  return (
    <DashPage
      title={`${nextName} has ${next.starsAvailable.toLocaleString()} points to spend.`}
      quiet={`Thank ${first} next.`}
      label="Members"
    >
      <XaSays links={[<StoreChatButton key="thank" label={`Ask Strelva to write ${first} a thank-you`} prompt={`Write a short, warm thank-you I can send ${nextName}, a ${next.tier === "super-snapper" ? "top member" : "member"} with ${next.starsAvailable} points to spend. Suggest one reward they could use them on.`} />]}>
        {first} has earned {next.starsLifetime.toLocaleString()} points in all{next.tier === "super-snapper" ? " and is one of your top members" : ""}. A note from you brings people back.
      </XaSays>
      {others > 0 ? <section className="flex flex-col gap-2" aria-label="Every member">
        <h2 className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">{members.length} members</h2>
        <ul className={styles.list} aria-label="Members">
          {members.map((member) => {
            const name = member.displayName?.trim() || member.email;
            return (
              <li key={member.email}>
                <XaInitial name={name} shape="round" size={30} />
                <div className={styles.listText}>
                  <span className={styles.listTitle}>{name}</span>
                  <span className={styles.listDetail}>{member.starsAvailable.toLocaleString()} points to spend{member.tier === "super-snapper" ? ` · ${TIER_LABEL[member.tier]}` : ""}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section> : null}
    </DashPage>
  );
}
