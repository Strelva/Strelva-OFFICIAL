"use client";
import { PossibilityTryError } from "@/experience/systems/PossibilityTry";
export default function Error({ reset }: { reset: () => void }) { return <PossibilityTryError onRetry={reset} />; }
