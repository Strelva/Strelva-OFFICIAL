import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardVariant = "default" | "interactive";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles: Record<string, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "px-5 py-4",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", padding = "md", className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-gray-border rounded-xl",
        paddingStyles[padding],
        variant === "interactive" && "reb-card-glow transition-shadow duration-150",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";
