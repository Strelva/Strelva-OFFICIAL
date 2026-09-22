"use client";

import { OnboardingExperience, type OnboardingExperienceProps } from "@/products/onboarding/client";
import { useWorkspaceIntent } from "./WorkspaceIntent";

/** The experience owns request continuity; the native product owns its cases. */
export function OnboardingWorkspaceExperience(props: OnboardingExperienceProps) {
  const { request } = useWorkspaceIntent();
  return <OnboardingExperience {...props} initialRequest={props.initialRequest || request} />;
}
