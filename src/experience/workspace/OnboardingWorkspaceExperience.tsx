"use client";

import { OnboardingExperience, type OnboardingExperienceProps } from "@/products/onboarding/client";
import { intentRequestFor, useWorkspaceIntent } from "./WorkspaceIntent";

/** Shell request context stays outside the native onboarding product. */
export function OnboardingWorkspaceExperience(props: OnboardingExperienceProps) {
  const intent = useWorkspaceIntent();
  if (!props.initialCaseId && !props.initialRequest && !intent.ready) return <p role="status">Opening your request…</p>;
  const request = props.initialCaseId ? undefined : props.initialRequest || intentRequestFor(intent, "onboarding");
  const onSaved = props.onSaved && !props.initialCaseId ? (id: string) => { intent.spend("onboarding"); props.onSaved?.(id); } : props.onSaved;
  return <OnboardingExperience {...props} onSaved={onSaved} initialRequest={request} />;
}
