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
  valueProof?: string;
}

export function ConversationLayoutClient({
  children,
  threads: initialThreads,
  ownerName,
  pendingCount = 0,
  valueProof,
}: ConversationLayoutClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [threads] = useState<Thread[]>(initialThreads);

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

  return (
    <ConversationShell
      threads={threads}
      activeThreadId={activeThreadId}
      onNewChat={handleNewChat}
      onSelectThread={handleSelectThread}
      ownerName={ownerName}
      pendingCount={pendingCount}
      valueProof={valueProof}
    >
      {children}
    </ConversationShell>
  );
}

// Export the handler for child components to use
export { type Thread };
