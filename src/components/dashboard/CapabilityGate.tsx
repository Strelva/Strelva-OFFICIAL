"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { useDashboardOptional } from "./DashboardContext";

interface CapabilityInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

interface CapabilityContextValue {
  capabilities: CapabilityInfo[];
  loading: boolean;
}

const CapabilityContext = createContext<CapabilityContextValue>({
  capabilities: [],
  loading: true,
});

export function useCapabilities() {
  return useContext(CapabilityContext);
}

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [state, setState] = useState<CapabilityContextValue>({
    capabilities: [],
    loading: true,
  });

  useEffect(() => {
    fetch(dashboardHref("/api/capabilities"))
      .then((r) => r.json())
      .then((data) => setState({
        capabilities: data.capabilities || [],
        loading: false,
      }))
      .catch(() => setState((prev) => ({ ...prev, loading: false })));
  }, [dashboardHref]);

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

// All capabilities are included — gate always passes through
export function CapabilityGate({ children }: CapabilityGateProps) {
  return <>{children}</>;
}
