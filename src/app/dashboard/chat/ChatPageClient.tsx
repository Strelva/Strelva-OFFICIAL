"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import type { UnifiedEvent } from "@/lib/types";

interface ChatPageClientProps {
  threadId?: string;
  ownerName: string;
  needsYou: {
    openInitially?: boolean;
    pending: UnifiedEvent[];
    resolved: UnifiedEvent[];
    pendingCount: number;
    staleSectionCount: number;
  };
}

export function ChatPageClient({ threadId, ownerName, needsYou }: ChatPageClientProps) {
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
      needsYou={needsYou}
    />
  );
}
