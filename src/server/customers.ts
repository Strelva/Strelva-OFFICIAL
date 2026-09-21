import {
  createCustomerResourceReaders,
  createCustomerService,
  PostgresCustomerMappingStore,
  type CustomerActor,
  type CustomerListOptions,
  type CustomerInstallationView,
} from "@/platform/customers";
import { getConfiguredHomeFinderAdapter } from "@/products/home-finder/server";

function service() {
  const homeFinder = getConfiguredHomeFinderAdapter();
  return createCustomerService(
    new PostgresCustomerMappingStore(),
    createCustomerResourceReaders({
      homeFinderReader: homeFinder ?? undefined,
    }),
    undefined,
    homeFinder ?? undefined,
  );
}

export function listCustomers(
  actor: CustomerActor,
  organizationId: string,
  options: CustomerListOptions = {},
) {
  return service().listCustomers(actor, organizationId, options);
}

export function readCustomer(
  actor: CustomerActor,
  organizationId: string,
  customerId: string,
) {
  return service().readCustomer(actor, organizationId, customerId);
}

export function readCustomerInstallation(
  actor: CustomerActor,
  organizationId: string,
  customerId: string,
  resourceId: string,
  view: CustomerInstallationView = "summary",
  options: { cursor?: string; limit?: number; reference?: string } = {},
) {
  return service().readInstallation(
    actor,
    organizationId,
    customerId,
    resourceId,
    view,
    options,
  );
}
