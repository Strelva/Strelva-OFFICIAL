import type { InquiryEconomicsAuthority } from "@/platform/work-economics/adapters";
import { getInquiryRepository } from "./repository";

/** Native inquiry existence remains product-owned; the platform checks actor and tenant access first. */
export const inquiryEconomicsAuthority: InquiryEconomicsAuthority = {
  async containsTarget(tenantId, businessId, requestId, capabilityId) {
    const snapshot = await getInquiryRepository().getSnapshot(tenantId, businessId);
    if (!snapshot || snapshot.businessId !== businessId) return false;
    const request = snapshot.state.requests.find(item => item.id === requestId);
    const capability = snapshot.state.capabilities.find(item => item.id === capabilityId);
    return Boolean(request && capability && request.businessId === businessId
      && capability.businessId === businessId && request.capabilityId === capabilityId);
  },
};
