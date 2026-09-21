"use client";

import Link from "next/link";
import { useState } from "react";
import { WorkspaceHelp as WorkspaceHelpForm, type WorkspaceHelpProps } from "./WorkspaceHelpForm";
import { BusinessSetupPanel } from "./BusinessSetupPanel";
export type { WorkspaceHelpProps, WorkspaceHelpProviderOption } from "./WorkspaceHelpForm";

export function WorkspaceHelp(props: WorkspaceHelpProps) {
  const [contactOpen, setContactOpen] = useState(false);

  // A retained agency request needs an explicit customer business. General help
  // must still expose its existing contact and sharing controls without making
  // business creation a prerequisite. Do not mount an autofocus form while it
  // is hidden in a closed disclosure.
  if (!props.workspaceId && props.initialRequest?.trim()) {
    return <section className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="font-display text-3xl">Choose a business for this request.</h1>
      <BusinessSetupPanel key={props.initialRequest} initialRequest={props.initialRequest} />
      <details onToggle={event => setContactOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">Contact the team without setting up a business</summary>
        {contactOpen ? <WorkspaceHelpForm {...props} /> : null}
      </details>
    </section>;
  }

  if (!props.workspaceId) return <WorkspaceHelpForm {...props} />;
  return <><div className="px-6 pt-6"><Link href={`/workspace/delivery?businessId=${encodeURIComponent(props.workspaceId)}`}>Review saved requests and delivery deadlines</Link></div><WorkspaceHelpForm {...props} /></>;
}
