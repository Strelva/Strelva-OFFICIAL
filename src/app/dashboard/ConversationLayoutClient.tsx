"use client";

import type { ReactNode } from "react";
import { ConversationShell } from "@/components/dashboard/ConversationShell";

interface ConversationLayoutClientProps {
  children: ReactNode;
  ownerName: string;
  pendingCount?: number;
  valueProof?: string;
}

export function ConversationLayoutClient({
  children,
  ownerName,
  pendingCount = 0,
  valueProof,
}: ConversationLayoutClientProps) {
  return (
    <ConversationShell
      ownerName={ownerName}
      pendingCount={pendingCount}
      valueProof={valueProof}
    >
      {children}
    </ConversationShell>
  );
}
