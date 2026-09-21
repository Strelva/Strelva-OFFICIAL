import { CustomerService } from "./service";
import { createCustomerResourceReaders } from "./readers";
import { PostgresCustomerMappingStore } from "./store";
import type { CustomerInstallationResponse, CustomerInstallationView } from "./installation";
import type {
  CustomerActor,
  CustomerCollection,
  CustomerDetail,
  CustomerListOptions,
  CustomerResourceReaders,
} from "./types";
import type { HomeFinderManagementReader } from "./home-finder-port";

// Product-owned readers preserve native Website/work authorization and use the
// dedicated IDX management channel.  Missing provider configuration remains a
// typed unavailable/not-configured source state, never an implicit allow.
const defaultService = new CustomerService(
  new PostgresCustomerMappingStore(),
  createCustomerResourceReaders(),
);

export function createCustomerService(
  store: ConstructorParameters<typeof CustomerService>[0],
  readers: CustomerResourceReaders = {},
  cursorSecret?: string,
  homeFinderReader?: HomeFinderManagementReader,
): CustomerService {
  return new CustomerService(store, readers, cursorSecret, homeFinderReader);
}

/** MOD-07: authorize first, then list only explicitly assigned relationships. */
export function listCustomers(
  actor: CustomerActor,
  organizationId: string,
  options: CustomerListOptions = {},
): Promise<CustomerCollection> {
  return defaultService.listCustomers(actor, organizationId, options);
}

/** MOD-07: authorize first, then read only explicitly assigned resources. */
export function readCustomer(
  actor: CustomerActor,
  organizationId: string,
  customerId: string,
): Promise<CustomerDetail> {
  return defaultService.readCustomer(actor, organizationId, customerId);
}

/** Read one authorized Home Finder management view through the scoped adapter. */
export function readCustomerInstallation(
  actor: CustomerActor,
  organizationId: string,
  customerId: string,
  resourceId: string,
  view: CustomerInstallationView = "summary",
  options: { cursor?: string; limit?: number; reference?: string } = {},
): Promise<CustomerInstallationResponse> {
  return defaultService.readInstallation(actor, organizationId, customerId, resourceId, view, options);
}
