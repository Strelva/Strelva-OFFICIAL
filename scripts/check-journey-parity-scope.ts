/** Read-only proof probe: same guard and catalog projection as the journeys. */
import { syntheticJourneyParityTenantIds } from "../tests/support/journeys";
const ids = syntheticJourneyParityTenantIds();
process.stdout.write(`${ids.length} known synthetic/native fixture identities verified in the owned local Auth stack. No parity rows written.\n`);
