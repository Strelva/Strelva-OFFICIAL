"use client";

import { StHead, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./owner-help.module.css";
import { useState } from "react";
import { WorkspaceHelp as WorkspaceHelpForm, type WorkspaceHelpProps } from "./WorkspaceHelpForm";
import { BusinessSetupPanel } from "./BusinessSetupPanel";
export type { WorkspaceHelpProps, WorkspaceHelpAgencyOption, WorkspaceHelpProviderOption } from "./WorkspaceHelpForm";

export function WorkspaceHelp(props: WorkspaceHelpProps) {
  const [contactOpen, setContactOpen] = useState(false);

  // A retained agency request needs an explicit customer business. General help
  // must still expose its existing contact and sharing controls without making
  // business creation a prerequisite. Do not mount an autofocus form while it
  // is hidden in a closed disclosure.
  if (!props.workspaceId && props.initialRequest?.trim()) {
    return <StPage><section className={styles.businessSetup}>
      <StHead title="Choose a business for this request." />
      <BusinessSetupPanel key={props.initialRequest} initialRequest={props.initialRequest} />
      <details onToggle={event => setContactOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">Contact the team without setting up a business</summary>
        {contactOpen ? <WorkspaceHelpForm {...props} /> : null}
      </details>
    </section></StPage>;
  }

  if (!props.workspaceId) return <WorkspaceHelpForm {...props} />;
  return <><div className={styles.deliveryLink}><StTextButton href={`/workspace/delivery?businessId=${encodeURIComponent(props.workspaceId)}`}>Review saved requests and delivery deadlines</StTextButton></div><WorkspaceHelpForm {...props} /></>;
}
