"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import type { SubscriptionTier } from "@/lib/types";

interface CapabilityInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

interface CapabilityContextValue {
  tier: SubscriptionTier;
  capabilities: CapabilityInfo[];
  pricing: Record<string, { price: number; label: string }>;
  loading: boolean;
}

const CapabilityContext = createContext<CapabilityContextValue>({
  tier: "starter",
  capabilities: [],
  pricing: {},
  loading: true,
});

export function useCapabilities() {
  return useContext(CapabilityContext);
}

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CapabilityContextValue>({
    tier: "starter",
    capabilities: [],
    pricing: {},
    loading: true,
  });

  useEffect(() => {
    fetch("/api/capabilities")
      .then((r) => r.json())
      .then((data) => setState({
        tier: data.tier,
        capabilities: data.capabilities || [],
        pricing: data.pricing || {},
        loading: false,
      }))
      .catch(() => setState((prev) => ({ ...prev, loading: false })));
  }, []);

  return (
    <CapabilityContext.Provider value={state}>
      {children}
    </CapabilityContext.Provider>
  );
}

interface CapabilityGateProps {
  capability: string;
  children: ReactNode;
}

export function CapabilityGate({ capability, children }: CapabilityGateProps) {
  const { capabilities, tier, pricing, loading } = useCapabilities();

  if (loading) return <>{children}</>;

  const cap = capabilities.find((c) => c.id === capability);
  if (!cap || cap.available) return <>{children}</>;

  // Find the upgrade tier
  const tiers: SubscriptionTier[] = ["starter", "growth", "scale"];
  const currentIdx = tiers.indexOf(tier);
  const upgradeTier = tiers.find((t, i) => i > currentIdx);
  const upgradePrice = upgradeTier ? pricing[upgradeTier] : null;

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-surface-raised border border-gray-border rounded-lg p-5 shadow-sm max-w-xs text-center">
          <p className="text-[13px] font-medium text-warm-black mb-1">{cap.name}</p>
          <p className="text-[12px] text-gray-muted mb-3">{cap.description}</p>
          {upgradePrice && (
            <a
              href="/api/billing/portal"
              className="inline-block text-[12px] font-medium text-white bg-sage hover:bg-sage/90 rounded-md px-4 py-2 transition-colors"
            >
              Upgrade to {upgradePrice.label} — ${upgradePrice.price}/mo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
