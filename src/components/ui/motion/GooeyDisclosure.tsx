"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { strelvaMotion } from "@/lib/motion";

/** Pair with a button's aria-expanded/aria-controls. Move focus to it before closing. */
export function GooeyDisclosure({ open, id, children, className }: {
  open: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return <motion.div
    id={id}
    className={className}
    initial={false}
    animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
    transition={reduced ? strelvaMotion.reduced : {
      height: strelvaMotion.gooey,
      opacity: { duration: open ? 0.18 : 0.12 },
    }}
    inert={!open}
    aria-hidden={!open}
    style={{ overflow: "hidden" }}
  >{children}</motion.div>;
}
