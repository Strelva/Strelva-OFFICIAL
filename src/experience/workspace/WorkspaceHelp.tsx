"use client";

import { XaHeadline } from "@/components/ui/strelva/Xa";
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
    return <div className={styles.page}><section className={styles.businessSetup}>
      <XaHeadline size="md" quiet="A request belongs to one business and goes to its agency.">Choose a business for this request.</XaHeadline>
      <BusinessSetupPanel key={props.initialRequest} initialRequest={props.initialRequest} />
      <details onToggle={event => setContactOpen(event.currentTarget.open)}>
        <summary>Contact the team without setting up a business</summary>
        {contactOpen ? <WorkspaceHelpForm {...props} /> : null}
      </details>
    </section></div>;
  }

  if (!props.workspaceId) return <WorkspaceHelpForm {...props} />;
  return <WorkspaceHelpForm {...props} deliveryHref={props.deliveryHref ?? `/workspace/delivery?businessId=${encodeURIComponent(props.workspaceId)}`} />;
}
