"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RebuildExperience } from "./RebuildExperience";
import { WebsiteExperience } from "./WebsiteExperience";

/** Fictional UI only. Playwright must intercept every API before opening it. */
export function WebsiteFormsRecoveryFixture({ version, managed = false }: { version: 1 | 2; managed?: boolean }) {
  const [readOnly, setReadOnly] = useState(false);
  const [canPublish, setCanPublish] = useState(true);
  const identity = { workspaceId: "11111111-1111-4111-8111-111111111111", workId: "44444444-4444-4444-8444-444444444444" };
  return <main data-dashboard className="min-h-screen bg-surface-base">
    <header className="flex flex-wrap gap-4 border-b border-gray-border p-6 text-sm">
      <p>Fictional website forms interface · no Auth or publication proof</p>
      <Button className="max-w-full whitespace-normal" variant="secondary" onClick={() => setReadOnly(value => !value)}>{readOnly ? "Restore fictional editing access" : "Remove fictional editing access"}</Button>
      {version === 2 && managed ? <Button className="max-w-full whitespace-normal" variant="secondary" onClick={() => setCanPublish(value => !value)}>{canPublish ? "Remove fictional publication permission" : "Restore fictional publication permission"}</Button> : null}
      <Button className="max-w-full whitespace-normal" variant="secondary">Outside website control</Button>
    </header>
    {version === 2 ? <RebuildExperience {...identity} managed={managed} canPublish={canPublish} readOnly={readOnly} /> : <WebsiteExperience {...identity} readOnly={readOnly} />}
  </main>;
}
