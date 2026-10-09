"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RebuildExperience } from "./RebuildExperience";

/** Fictional browser transport is intercepted before mounting the actual HTTP consumer. */
export function WebsiteRoutingRecoveryFixture({ domain }: { domain: boolean }) {
  const [operator, setOperator] = useState(domain);
  return <main data-dashboard className="min-h-screen bg-surface-base">
    <header className="flex flex-wrap gap-4 border-b border-gray-border p-6 text-sm">
      <p>Fictional routing recovery · no DNS, Auth, provider or publication proof</p>
      <Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => setOperator(value => !value)}>{operator ? "Remove fictional operator access" : "Restore fictional operator access"}</Button>
      <Button variant="secondary" className="max-w-full whitespace-normal">Outside website control</Button>
    </header>
    <RebuildExperience workspaceId="11111111-1111-4111-8111-111111111111" workId="44444444-4444-4444-8444-444444444444" managed operator={operator} canPublish />
  </main>;
}
