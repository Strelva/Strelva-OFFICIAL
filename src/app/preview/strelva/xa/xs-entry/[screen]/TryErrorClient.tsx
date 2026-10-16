"use client";
import { useState } from "react";
import { PossibilityTryError } from "@/experience/systems/PossibilityTry";

/** Preview only: the error boundary's retry, which here just re-renders. */
export function PossibilityTryErrorClient({ mode }: { mode?: "light" | "dark" }) {
  const [tries, setTries] = useState(0);
  return <PossibilityTryError key={tries} mode={mode} onRetry={() => setTries(tries + 1)} />;
}
