import { XaWorking } from "@/components/ui/strelva/Xa";
import { XaOutside } from "@/components/ui/strelva/Xa";

export default function LoadingHomeFinder() {
  return <XaOutside from={null} meta="Home search" label="Opening Home Finder"><XaWorking title="Opening Home Finder" steps={[{ id: "entry", label: "Checking access from the brokerage website", state: "active" }]} /></XaOutside>;
}
