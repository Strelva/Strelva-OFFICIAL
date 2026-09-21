"use client";

import Link from "next/link";
import { WorkspaceHelp as WorkspaceHelpForm, type WorkspaceHelpProps } from "./WorkspaceHelpForm";
import { BusinessSetupPanel } from "./BusinessSetupPanel";
export type { WorkspaceHelpProps, WorkspaceHelpProviderOption } from "./WorkspaceHelpForm";

export function WorkspaceHelp(props: WorkspaceHelpProps) {
  if (!props.workspaceId) return <section className="mx-auto max-w-2xl space-y-6 p-6"><h1 className="font-display text-3xl">What do you need?</h1><BusinessSetupPanel key={props.initialRequest} initialRequest={props.initialRequest} /><details><summary className="cursor-pointer text-sm">Contact the team without setting up a business</summary><WorkspaceHelpForm {...props} /></details></section>;
  return <><div className="px-6 pt-6"><Link href={`/workspace/delivery?businessId=${encodeURIComponent(props.workspaceId)}`}>Review saved requests and delivery deadlines</Link></div><WorkspaceHelpForm {...props} /></>;
}
