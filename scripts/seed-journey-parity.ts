/** All synthetic coverage shares the actual owned-stack fixture guard. */
import { localSql, seedSyntheticJourneyParity, syntheticJourneyParityTenantIds } from "../tests/support/journeys";
syntheticJourneyParityTenantIds(); // Refuse unknowns before even adding the marker.
localSql(`insert into public.tenants(id,site_name,active) values('journeys-parity','Journeys parity fixture',false) on conflict(id) do nothing;`);
seedSyntheticJourneyParity();
process.stdout.write("Synthetic backdated coverage seeded only for known fixtures in the owned Auth stack. No observed parity is implied.\n");
