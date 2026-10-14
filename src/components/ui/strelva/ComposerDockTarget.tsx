"use client";

import { createContext } from "react";

/** A shell-owned footer slot. Docks without a shell remain in normal flow. */
export const ComposerDockTarget = createContext<HTMLElement | null>(null);
