"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/dashboard/ChatPanel";

interface DashboardPageClientProps {
  threadId?: string;
  ownerName: string;
}

export function DashboardPageClient({ threadId, ownerName }: DashboardPageClientProps) {
  const router = useRouter();

  const handleThreadCreated = useCallback(
    (id: string) => {
      router.replace(`/dashboard?thread=${id}`);
    },
    [router]
  );

  return (
    <ChatPanel
      threadId={threadId}
      ownerName={ownerName}
      onThreadCreated={handleThreadCreated}
    />
  );
}
