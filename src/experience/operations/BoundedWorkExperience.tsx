"use client";

import type { ComponentProps } from "react";
import { useWorkspaceIntent } from "@/platform/workspaces/client-intent";
import { ApplicationStartExperience } from "@/experience/applications/ApplicationStartExperience";
import { BoundedWorkExperience as BoundedWorkSession } from "./BoundedWorkSession";
export * from "./BoundedWorkSession";

type Props = ComponentProps<typeof BoundedWorkSession>;

/** Creation gets an editable preview. Existing records keep the native lifecycle and permission paths. */
export function BoundedWorkExperience(props: Props) {
  const intent = useWorkspaceIntent(props.workspaceId, props.productId);
  if (props.productId === "applications" && !props.workId && !props.readOnly && !props.draftEditOnly && !props.workspaceStopped) {
    return <ApplicationStartExperience key={`${props.workspaceId}:${intent?.templateId ?? "blank"}`} workspaceId={props.workspaceId} initialTemplateId={intent?.templateId} initialRequest={props.initialRequest || intent?.request} sources={props.sources} onSaved={props.onSaved} />;
  }
  return <BoundedWorkSession {...props} initialRequest={props.initialRequest || intent?.request} />;
}
