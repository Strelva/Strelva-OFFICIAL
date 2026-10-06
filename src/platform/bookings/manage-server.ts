/** The real dependencies of the manage link: the one store's token lookup and the public booking service. */
import { createPublicWebsiteBookingService } from "@/products/scheduling/server";
import type { ManageDeps } from "./manage";
import { readReservationByManageTokenHash } from "./store";

export function manageDeps(): ManageDeps {
  const service = createPublicWebsiteBookingService();
  return {
    find: (hash) => readReservationByManageTokenHash(hash),
    read: (input) => service.read(input),
    change: (input) => service.change(input),
    cancel: (input) => service.cancel(input),
    now: () => Date.now(),
  };
}
