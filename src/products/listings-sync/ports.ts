/**
 * What Listings in sync needs from the tenant model (src/lib). The slot lives in
 * src/platform/listings-sync/runtime-ports.ts so the app edge can register it
 * without evaluating this product.
 */
export {
  listingsTenantPorts, registerListingsTenantPorts, type ListingsTenant, type ListingsTenantPorts,
} from "@/platform/listings-sync/runtime-ports";
