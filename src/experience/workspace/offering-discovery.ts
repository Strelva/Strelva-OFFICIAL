import type { OfferingDefinitionView, OfferingInstallation } from "@/platform/offerings";
import type { WorkspaceProduct } from "./contracts";

export type OfferingDiscoveryAction =
  | { kind: "open"; label: "Open" }
  | { kind: "start"; label: "Start" | "Start setup" }
  | { kind: "request"; label: "Request setup" }
  | { kind: "explore"; label: "Explore example" };

export type OfferingDiscoveryTarget = "product" | "offering";

export interface OfferingDiscoverySecondaryAction {
  target: OfferingDiscoveryTarget;
  action: OfferingDiscoveryAction;
  title: string;
}

export interface OfferingDiscoveryEntry {
  key: string;
  title: string;
  description: string;
  sourceIds: readonly string[];
  action: OfferingDiscoveryAction;
  primaryTarget: OfferingDiscoveryTarget;
  secondary?: OfferingDiscoverySecondaryAction;
  offering?: OfferingDefinitionView;
  product?: WorkspaceProduct;
  installation?: OfferingInstallation;
}

const FAMILY_BY_ID: Readonly<Record<string, string>> = {
  managed_presence: "managed_websites",
  managed_website_changes: "managed_websites",
  inquiries: "inquiries",
  customer_inquiry_intake: "inquiries",
  applications: "applications",
  private_staff_requests: "applications",
};

export function discoveryFamilyFor(id: string): string {
  return FAMILY_BY_ID[id] ?? id;
}

export function discoveryActionForOffering(
  offering: OfferingDefinitionView,
  installation?: OfferingInstallation,
): OfferingDiscoveryAction {
  if (installation && installation.status !== "retired") return { kind: "open", label: "Open" };
  return offering.installability === "available"
    ? { kind: "start", label: "Start setup" }
    : { kind: "request", label: "Request setup" };
}

export function discoveryActionForProduct(product: WorkspaceProduct): OfferingDiscoveryAction {
  if (product.availability === "available") return { kind: "start", label: "Start" };
  if (product.availability === "not_enabled" && product.previewHref) return { kind: "explore", label: "Explore example" };
  return { kind: "request", label: "Request setup" };
}

export function composeOfferingDiscovery({
  products,
  definitions,
  installations,
}: {
  products: readonly WorkspaceProduct[];
  definitions: readonly OfferingDefinitionView[];
  installations: readonly OfferingInstallation[];
}): OfferingDiscoveryEntry[] {
  const entries = new Map<string, OfferingDiscoveryEntry>();
  for (const product of products) {
    const key = discoveryFamilyFor(product.id);
    entries.set(key, {
      key,
      title: product.name,
      description: product.description,
      sourceIds: [product.id],
      action: discoveryActionForProduct(product),
      primaryTarget: "product",
      product,
    });
  }
  for (const offering of definitions) {
    const key = discoveryFamilyFor(offering.id);
    const installation = installations.find((item) => item.definitionId === offering.id && item.status !== "retired");
    const current = entries.get(key);
    if (!current) {
      const action = discoveryActionForOffering(offering, installation);
      entries.set(key, {
        key,
        title: offering.name,
        description: offering.description,
        sourceIds: [offering.id],
        action,
        primaryTarget: "offering",
        offering,
        installation,
      });
      continue;
    }

    const productAction = current.primaryTarget === "product" ? current.action : current.secondary?.action;
    const offeringAction = discoveryActionForOffering(offering, installation);
    const productIsPrimary = productAction
      ? productAction.kind === "start" || productAction.kind === "explore" || (offeringAction.kind !== "start" && offeringAction.kind !== "open")
      : false;
    const primaryTarget: OfferingDiscoveryTarget = productIsPrimary ? "product" : "offering";
    const primaryAction = productIsPrimary ? productAction! : offeringAction;
    const secondaryTarget: OfferingDiscoveryTarget = primaryTarget === "product" ? "offering" : "product";
    const secondaryAction = secondaryTarget === "offering" ? offeringAction : productAction;
    entries.set(key, {
      key,
      title: primaryTarget === "product" ? current.title : offering.name,
      description: primaryTarget === "product" ? current.description : offering.description,
      sourceIds: [...current.sourceIds, offering.id],
      action: primaryAction,
      primaryTarget,
      ...(secondaryAction ? { secondary: { target: secondaryTarget, action: secondaryAction, title: secondaryTarget === "offering" ? offering.name : current.title } } : {}),
      offering,
      product: current?.product,
      installation,
    });
  }
  return [...entries.values()];
}
