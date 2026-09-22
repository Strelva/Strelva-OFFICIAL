"use client";

import { OnboardingExperience, type OnboardingExperienceProps } from "@/products/onboarding/OnboardingExperience";
import { useWorkspaceIntent } from "./WorkspaceIntent";

/** Shell request context stays outside the native onboarding product. */
export function OnboardingWorkspaceExperience(props: OnboardingExperienceProps) {
  const intent = useWorkspaceIntent();
  if (!props.initialCaseId && !props.initialRequest && !intent.ready) return <p role="status">Opening your request…</p>;
  const request = props.initialCaseId ? undefined : props.initialRequest || (intent.route === "onboarding" ? intent.request : undefined);
  return <OnboardingExperience {...props} initialRequest={request} />;
}
