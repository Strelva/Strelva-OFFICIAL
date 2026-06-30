import { requireDashboardView } from "@/lib/dashboard-auth";
import { getActorContext } from "@/lib/auth";
import { isDevAccessBypassEnabled } from "@/lib/dev-access";
import { getNeedsYouData } from "@/lib/needs-you";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { ChatPageClient } from "./ChatPageClient";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; needs?: string }>;
}) {
  const params = await searchParams;
  const { tenant } = await requireDashboardView();

  // Greet the SIGNED-IN person (login identity), matching the sidebar's
  // "Hello, {name}" — not the tenant's owner-name setting, so it stays
  // consistent for a super-admin viewing any client.
  const actor = await getActorContext(tenant);
  const accountEmail = actor.email && actor.email.includes("@") ? actor.email : null;
  const rawAccount =
    actor.name?.trim() ||
    (accountEmail ? accountEmail.split("@")[0] : "") ||
    (isDevAccessBypassEnabled() ? "Noah" : "");
  const ownerName = rawAccount ? rawAccount.charAt(0).toUpperCase() + rawAccount.slice(1) : "there";
  // The AI chat is the product's core surface — getNeedsYouData degrades every
  // read so a transient backend blip can't replace the whole chat with an error.
  const { pending, resolved, pendingCount, staleSectionCount } = await getNeedsYouData(tenant);

  return (
    <>
      <EngagementTracker event="ai-chat-open" />
      <ChatPageClient
        threadId={params.thread}
        ownerName={ownerName}
        needsYou={{
          openInitially: params.needs === "1",
          pending,
          resolved,
          pendingCount,
          staleSectionCount,
        }}
      />
    </>
  );
}
