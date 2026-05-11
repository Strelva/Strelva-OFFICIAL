"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface ChatPageClientProps {
  threadId?: string;
  ownerName: string;
}

export function ChatPageClient({ threadId, ownerName }: ChatPageClientProps) {
  const router = useRouter();
  const { dashboardHref } = useDashboard();

  const handleThreadCreated = useCallback(
    (id: string) => {
      router.replace(dashboardHref(`/dashboard/chat?thread=${id}`));
    },
    [dashboardHref, router]
  );

  return (
    <ChatPanel
      threadId={threadId}
      ownerName={ownerName}
      onThreadCreated={handleThreadCreated}
    />
  );
}
