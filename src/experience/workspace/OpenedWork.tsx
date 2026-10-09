"use client";

import type { ComponentProps } from "react";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { CustomApplicationManageExperience } from "@/experience/custom-applications/CustomApplicationManageExperience";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
import { websiteWorkDocumentVersion } from "@/experience/websites/contracts";
import { DocumentExperience } from "./DocumentExperience";
import { TrackerExperience } from "./TrackerExperience";
import { OnboardingWorkspaceExperience } from "./OnboardingWorkspaceExperience";
import { LocalDocumentPreview } from "./preview/LocalDocumentPreview";
import { LocalTrackerPreview } from "./preview/LocalTrackerPreview";
import type { WorkspaceWork } from "./contracts";

type Props = {
  workspaceId: string;
  workId?: string;
  readOnly: boolean;
  sources: readonly WorkspaceWork[];
  onSaved?: (id: string) => void;
  localPreview?: boolean;
} & (
  | { productId: "tracker"; templateId?: ComponentProps<typeof TrackerExperience>["templateId"] }
  | { productId: "documents"; initialRequestText?: string }
  | ({ productId: "websites" } & Pick<ComponentProps<typeof WebsiteExperience>, "rebuildEnabled" | "managed" | "canPublish" | "agency" | "initialRequest">)
  | { productId: "onboarding"; initialRequest?: string }
  | { productId: "custom-applications" }
  | Pick<ComponentProps<typeof BoundedWorkExperience>, "productId" | "canManage" | "canEdit" | "draftEditOnly" | "workspaceStopped" | "calendarRecoveryAllowed" | "initialRequest">
);

const stayInWork = () => undefined;

/** The internal tools shared by workspace and System entrances, not a System-kind registry.
 * Callers decide authority and save effects; each tool owns its keyed session and recovery. */
export function OpenedWork(props: Props) {
  switch (props.productId) {
    case "tracker": return props.localPreview
      ? <LocalTrackerPreview workspaceId={props.workspaceId} readOnly={props.readOnly} templateId={props.templateId} />
      : <TrackerExperience {...props} />;
    case "documents": return props.localPreview
      ? <LocalDocumentPreview workspaceId={props.workspaceId} readOnly={props.readOnly} initialRequestText={props.initialRequestText} />
      : <DocumentExperience {...props} />;
    case "websites": return <WebsiteExperience {...props} rebuildVersion={websiteWorkDocumentVersion(props.sources.find(work => work.id === props.workId))} />;
    case "onboarding": return <OnboardingWorkspaceExperience {...props} initialCaseId={props.workId} />;
    case "custom-applications": return props.workId
      ? <CustomApplicationManageExperience workId={props.workId} readOnly={props.readOnly} />
      : <p role="status">Select a saved custom application to review its delivery.</p>;
    default: return <BoundedWorkExperience {...props} sources={[...props.sources]} onSaved={props.onSaved ?? stayInWork} />;
  }
}
