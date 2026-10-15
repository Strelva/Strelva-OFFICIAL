import { vi } from "vitest";
import { KEYED_INTEGRATIONS, PROVIDER_KEY_REQUIREMENTS } from "@/platform/connections/provider-keys";

/** Stubs fictional values for every provider key, so tests that are not about key readiness see Strelva set up. */
export function stubAllProviderKeys(except: readonly string[] = []): void {
  for (const integration of KEYED_INTEGRATIONS) {
    for (const requirement of PROVIDER_KEY_REQUIREMENTS[integration]) {
      const name = requirement.anyOf[0]!;
      if (!except.includes(name)) vi.stubEnv(name, "fictional-test-value");
    }
  }
}
