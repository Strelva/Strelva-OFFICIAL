"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/dashboard/ChatPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import type { UnifiedEvent } from "@/lib/types";
import { consumeWebsiteRequestDraft } from "@/lib/website-request-draft";

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
  const { dashboardHref, tenantId, setChatPrompt } = useDashboard();

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("draft");
    if (!token || !tenantId) return;
    try {
      const draft = consumeWebsiteRequestDraft(token, tenantId, window.sessionStorage);
      if (draft) setChatPrompt(draft);
      url.searchParams.delete("draft");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch { /* Storage restrictions leave the existing governed composer usable. */ }
  }, [tenantId, setChatPrompt]);

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
