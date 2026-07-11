import { Star, Users } from "lucide-react";
import type { Member } from "@/lib/rewards/types";

/**
 * Read-only members surface. The page decides which state to render:
 *  - not configured (KV off / feature not wired) -> honest "not set up" state
 *  - configured + members    -> the list with a verdict header
 *  - configured + no members -> honest empty state
 *
 * This is intentionally read-only — adding/editing members and adjusting points
 * is a separate, deferred build. Here we only surface what already exists.
 */
type MembersPanelProps =
  | { configured: false }
  | { configured: true; members: Member[] };

const TIER_LABEL: Record<Member["tier"], string> = {
  snapper: "Member",
  "super-snapper": "Top member",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const name = member.displayName?.trim() || member.email;
  const showEmail = Boolean(member.displayName?.trim());
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl dashboard-panel p-4">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-warm-black truncate">{name}</p>
        {showEmail && (
          <p className="mt-1 text-[11px] text-gray-muted truncate">{member.email}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="rounded-md border border-glass-border bg-glass px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-muted">
          {TIER_LABEL[member.tier]}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warm-black">
          <Star className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
          {member.starsAvailable.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function MembersPanel(props: MembersPanelProps) {
  if (!props.configured) {
    return (
      <Shell>
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Members
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
            Membership isn&apos;t turned on yet
          </h1>
        </div>
        <div className="rounded-xl dashboard-panel p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
            <Users className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-medium text-warm-black">
            A members and points program isn&apos;t set up for your site
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
            Want to reward repeat customers with points and perks? Ask Strelva to turn on
            membership for your site and we&apos;ll get it running.
          </p>
        </div>
      </Shell>
    );
  }

  const { members } = props;

  if (members.length === 0) {
    return (
      <Shell>
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Members
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
            No members yet
          </h1>
        </div>
        <div className="rounded-xl dashboard-panel p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
            <Users className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-medium text-warm-black">
            When customers join your program, they&apos;ll show up here
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
            Each member&apos;s points and status will appear in this list as they earn.
          </p>
        </div>
      </Shell>
    );
  }

  const pointsAwarded = members.reduce((sum, m) => sum + m.starsLifetime, 0);

  return (
    <Shell>
      <div className="mb-5">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
          Members
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
          Your members
        </h1>
        <p className="mt-3 flex items-center gap-1.5 text-[14px] text-gray-muted">
          <Users className="h-4 w-4 text-accent" strokeWidth={1.5} />
          {members.length} {members.length === 1 ? "member" : "members"} ·{" "}
          {pointsAwarded.toLocaleString()} points awarded
        </p>
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <MemberRow key={member.email} member={member} />
        ))}
      </div>
    </Shell>
  );
}
