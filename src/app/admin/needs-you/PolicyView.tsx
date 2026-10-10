import { StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSection } from "@/components/ui/strelva/Kit";
import type { BusinessPolicy, OperatorLoad } from "./data";
import { OperatorPolicyEditor } from "./OperatorPolicyEditor";

/** Strelva's policy layer, with the owner's stricter setting left intact. */
export function PolicyScreen({ load, hrefFor, readOnly = false }: { readOnly?: boolean; load: OperatorLoad<BusinessPolicy>; hrefFor: (workspaceId: string) => string }) {
  if (load.state !== "ready") {
    return <StPage><StHead title="Who decides" />
      <StNotice tone={load.state === "unavailable" ? "critical" : "need"}>
        {load.state === "off" ? "Needs you is off" : load.state === "denied" ? "Operators only" : "The policy could not be read"}
      </StNotice>
      <StEmpty>{load.state === "off" ? "Who decides becomes available when this release is enabled. Nothing is decided by policy yet."
        : load.state === "denied" ? "Who decides is set by Strelva operators. Sign in with a verified operator account." : load.message}</StEmpty>
    </StPage>;
  }
  const { businesses, selected } = load.value;
  return <StPage>
    <StHead title="Who decides" meta="Strelva’s starting route for each kind of change, per business. The owner can make any kind stricter. Their setting and their decisions stay theirs." />
    <StSection title="Businesses" meta={<StMono>{businesses.length}</StMono>}>
      {businesses.length ? <StRows label="Businesses">{businesses.map(business => <StRow key={business.id}
        href={hrefFor(business.id)} selected={selected?.id === business.id} title={business.name}
        end={<StMono>{business.strelvaRows} Strelva · {business.ownerRows} owner</StMono>} />)}</StRows>
        : <StEmpty>No customer businesses yet.</StEmpty>}
    </StSection>
    {selected ? <StSection title={selected.name} meta={<StMono>{selected.view.history.length} recent changes</StMono>}>
      <OperatorPolicyEditor key={selected.id} workspaceId={selected.id} view={selected.view} readOnly={readOnly} />
    </StSection> : businesses.length ? <StEmpty>Choose a business to read its decision settings.</StEmpty> : null}
  </StPage>;
}
