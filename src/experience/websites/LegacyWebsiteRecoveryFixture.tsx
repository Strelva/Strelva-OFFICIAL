"use client";

import { Button } from "@/components/ui/Button";
import { WebsiteExperience } from "./WebsiteExperience";

/** Browser proof supplies fictional responses before mounting this default HTTP consumer. */
export function LegacyWebsiteRecoveryFixture({ saved }: { saved: boolean }) {
  return <main data-dashboard className="min-h-screen bg-surface-base">
    <header className="flex flex-wrap gap-4 border-b border-gray-border p-6 text-sm">
      <p>Fictional website recovery · no Auth, generation or publication proof</p>
      <Button variant="secondary">Outside website control</Button>
    </header>
    <WebsiteExperience workspaceId="11111111-1111-4111-8111-111111111111" workId={saved ? "44444444-4444-4444-8444-444444444444" : undefined} />
  </main>;
}
