import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function BillingLoading() {
  return <main data-workspace-theme="linen"><StPage><StHead title="Plan and billing" /><StSkeleton label="Loading billing details" /><StSkeleton width="60%" /></StPage></main>;
}
