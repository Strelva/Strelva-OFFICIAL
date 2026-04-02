import { Bot, User } from "lucide-react";
import { cn } from "@/lib/cn";

type AvatarType = "bot" | "user";
type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  type?: AvatarType;
  size?: AvatarSize;
  className?: string;
}

const containerSize: Record<AvatarSize, string> = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
};

const iconSize: Record<AvatarSize, string> = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

const typeStyles: Record<AvatarType, string> = {
  bot: "bg-sage text-white",
  user: "bg-gray-bg text-gray-muted",
};

export function Avatar({ type = "bot", size = "md", className }: AvatarProps) {
  const Icon = type === "bot" ? Bot : User;
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        containerSize[size],
        typeStyles[type],
        className,
      )}
    >
      <Icon className={iconSize[size]} strokeWidth={1.5} />
    </div>
  );
}
