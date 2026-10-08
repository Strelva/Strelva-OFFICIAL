"use client";
import { useSyncExternalStore } from "react";
import { StrelvaConnectedBookingForm } from "../../../custom-repo-starter/StrelvaBookingForm";
/** Absolute same-origin transport; shared client-site endpoints remain unchanged. */
export function AskServiceBookingForm({tenant,capabilityId,range}:{tenant:string;capabilityId:string;range:{from:string;to:string}}) {
  const origin=useSyncExternalStore(subscribe,readOrigin,serverOrigin);
  return <section className="space-y-4 rounded-xl border border-gray-border bg-surface p-5 [&_form]:space-y-4 [&_label]:mb-1 [&_label]:block [&_input]:mb-4 [&_input]:block [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-gray-border [&_input]:bg-surface-inset [&_input]:px-3 [&_input]:py-2 [&_textarea]:mb-4 [&_textarea]:block [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-gray-border [&_textarea]:bg-surface-inset [&_textarea]:p-3 [&_select]:mb-4 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-gray-border [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:border [&_button]:border-gray-border [&_button]:bg-surface-elevated [&_button]:px-4 [&_button]:py-2 [&_button]:font-medium [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2"><p className="text-sm">Request a time. The business confirms your appointment.</p>{origin?<StrelvaConnectedBookingForm baseUrl={`${origin}/api/v1/ask-service-bookings`} tenant={tenant} capabilityId={capabilityId} range={range} expectedVersion={1}/>:<p role="status">Loading booking form…</p>}</section>;
}
const subscribe=()=>()=>{};
const readOrigin=()=>window.location.origin;
const serverOrigin=()=>null;
