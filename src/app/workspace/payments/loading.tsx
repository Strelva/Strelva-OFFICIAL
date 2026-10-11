import { StHead, StPage, StSkeleton } from "@/components/ui/strelva/Kit";
export default function PaymentsLoading() {
  return <main data-workspace-theme="linen"><StPage><StHead title="Take deposits and payments" /><StSkeleton label="Loading payment details" /><StSkeleton width="60%" /></StPage></main>;
}
