"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConversationShell } from "@/components/dashboard/ConversationShell";
import type { Thread } from "@/components/dashboard/HistorySidebar";

interface ConversationLayoutClientProps {
  children: ReactNode;
  threads: Thread[];
  ownerName: string;
  pendingCount?: number;
}

export function ConversationLayoutClient({
  children,
  threads: initialThreads,
  ownerName,
  pendingCount = 0,
}: ConversationLayoutClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>(initialThreads);

  const activeThreadId = searchParams.get("thread");

  const handleNewChat = useCallback(() => {
    // Clear thread from URL to start fresh
    router.push("/dashboard/chat");
  }, [router]);

  const handleSelectThread = useCallback(
    (id: string) => {
      router.push(`/dashboard/chat?thread=${id}`);
    },
    [router]
  );

  const handleThreadCreated = useCallback(
    (id: string) => {
      // Add new thread to the list optimistically
      setThreads((prev) => [
        {
          id,
          title: "New chat",
          preview: "",
          updatedAt: Date.now(),
        },
        ...prev,
      ]);
      // Update URL with new thread ID
      router.replace(`/dashboard/chat?thread=${id}`);
    },
    [router]
  );

  return (
    <ConversationShell
      threads={threads}
      activeThreadId={activeThreadId}
      onNewChat={handleNewChat}
      onSelectThread={handleSelectThread}
      ownerName={ownerName}
      pendingCount={pendingCount}
    >
      {children}
    </ConversationShell>
  );
}

// Export the handler for child components to use
export { type Thread };
