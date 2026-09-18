import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./atmospheric-card.module.css";

/** Compose headings inside AtmosphericCard; supply the appropriate heading level. */
export function AtmosphericCardHeader({ icon, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return <div {...props} className={cn(styles.header, className)}>{icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}<div>{children}</div></div>;
}

/** A quieter detail surface. It inherits the card palette without another blur. */
export function AtmosphericCardDetail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(styles.detail, className)} />;
}

export function AtmosphericCardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(styles.footer, className)} />;
}
