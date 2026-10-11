import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function BusinessDetailsLoading() {
  return <main data-workspace-theme="linen"><StPage><StHead title="The business record" /><StSkeleton label="Loading business facts" /><StSkeleton width="70%" /></StPage></main>;
}
