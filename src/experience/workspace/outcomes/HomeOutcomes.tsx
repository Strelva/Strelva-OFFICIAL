"use client";

import { createContext, useContext } from "react";
import type { LoopRibbonProps } from "./LoopRibbon";

/**
 * Outcome data for business Home. Null (the default) renders Home exactly as
 * before. Only the local preview provides it today (`outcomes=on`): the
 * outcome loop (site → inquiry → reply → booking → review) is not joined on
 * the server yet, so no live route sets this.
 */
export interface HomeOutcomes {
  loop: LoopRibbonProps;
}

const HomeOutcomesContext = createContext<HomeOutcomes | null>(null);

export const HomeOutcomesProvider = HomeOutcomesContext.Provider;

export function useHomeOutcomes(): HomeOutcomes | null {
  return useContext(HomeOutcomesContext);
}
