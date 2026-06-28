import { requireDashboardView } from "@/lib/dashboard-auth";
import { getContent } from "@/lib/storage";
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

  let ownerName = "there";
  try {
    const settings = await getContent("settings", tenant);
    ownerName = settings.ownerName || ownerName;
  } catch {}
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
