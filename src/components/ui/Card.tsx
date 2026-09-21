import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./primitives.module.css";

type CardVariant = "default" | "interactive";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles: Record<string, string | undefined> = {
  none: "",
  sm: styles.cardSmall,
  md: styles.cardMedium,
  lg: styles.cardLarge,
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", padding = "md", className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface",
        styles.card,
        paddingStyles[padding],
        variant === "interactive" && styles.cardInteractive,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";
