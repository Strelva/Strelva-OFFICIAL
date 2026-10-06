import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AdminEmpty, Panel, PanelCount } from "../console";
import type { BusinessPolicy, OperatorLoad } from "./data";
import { OperatorPolicyEditor } from "./OperatorPolicyEditor";

/**
 * The operator's policy screen body: pick a business, then set Strelva's
 * layer per kind. Shared by /admin/needs-you and its local preview.
 */
export function PolicyScreen({ load, hrefFor }: { load: OperatorLoad<BusinessPolicy>; hrefFor: (workspaceId: string) => string }) {
  if (load.state !== "ready") {
    return <div className="mx-auto max-w-[920px]">
      <AdminEmpty icon={<ShieldAlert className="size-5" aria-hidden />}
        title={load.state === "off" ? "Needs you is off" : load.state === "denied" ? "Operators only" : "The policy could not be read"}
        description={load.state === "off" ? "Who decides is set here once STRELVA_NEEDS_YOU_RELEASE is on. Nothing is decided by policy yet."
          : load.state === "denied" ? "Who decides is set by Strelva operators. Sign in with a verified operator account." : load.message} />
    </div>;
  }
  const { businesses, selected } = load.value;
  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <header>
        <h1 className="font-display text-[26px] font-medium tracking-[-0.02em] text-warm-white">Who decides</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-gray-muted">
          Strelva&apos;s starting route for each kind of change, per business. Never below the floor. The owner can make any kind stricter; you can&apos;t change their setting, and you never decide an owner&apos;s call.
        </p>
      </header>
      <Panel title="Businesses" trailing={<PanelCount>{businesses.length}</PanelCount>}>
        {businesses.length ? <ul className="divide-y divide-glass-border border-t border-glass-border">
          {businesses.map(business => <li key={business.id}>
            <Link href={hrefFor(business.id)} aria-current={selected?.id === business.id ? "page" : undefined}
              className={`flex min-h-12 items-center justify-between gap-3 px-[18px] py-2.5 text-[13px] hover:bg-gray-bg ${selected?.id === business.id ? "text-accent" : "text-warm-white"}`}>
              <span>{business.name}</span>
              <span className="font-mono text-[11px] text-gray-faint">{business.strelvaRows} Strelva · {business.ownerRows} owner</span>
            </Link>
          </li>)}
        </ul> : <p className="border-t border-glass-border px-[18px] py-4 text-[13px] text-gray-muted">No customer businesses yet.</p>}
      </Panel>
      {selected ? <Panel title={selected.name} trailing={<PanelCount>{selected.view.history.length} recent changes</PanelCount>}>
        <OperatorPolicyEditor key={selected.id} workspaceId={selected.id} view={selected.view} />
      </Panel> : null}
    </div>
  );
}
