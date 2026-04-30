"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/dashboard/ChatPanel";

interface ChatPageClientProps {
  threadId?: string;
  ownerName: string;
}

export function ChatPageClient({ threadId, ownerName }: ChatPageClientProps) {
  const router = useRouter();

  const handleThreadCreated = useCallback(
    (id: string) => {
      router.replace(`/dashboard/chat?thread=${id}`);
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
