"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

type ConnectionStatus = "connected" | "stale" | "error" | "disconnected";

interface SourceHealthBadgeProps {
  status: ConnectionStatus;
  lastSync?: string | Date | null;
  provider?: string;
  compact?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, {
  icon: typeof CheckCircle2;
  label: string;
  bg: string;
  text: string;
  dot: string;
}> = {
  connected: {
    icon: CheckCircle2,
    label: "Connected",
    bg: "bg-success-dim",
    text: "text-success",
    dot: "bg-success",
  },
  stale: {
    icon: Clock,
    label: "Stale",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    dot: "bg-amber-500",
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    bg: "bg-red-500/10",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  disconnected: {
    icon: RefreshCw,
    label: "Not connected",
    bg: "bg-gray-bg",
    text: "text-gray-muted",
    dot: "bg-gray-muted",
  },
};

export function SourceHealthBadge({
  status,
  lastSync,
  provider,
  compact = false,
  className,
}: SourceHealthBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const syncTime = lastSync ? new Date(lastSync) : null;
  const syncLabel = syncTime
    ? `Last sync ${formatDistanceToNow(syncTime, { addSuffix: true })}`
    : null;

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          config.bg,
          config.text,
          className
        )}
        title={syncLabel || undefined}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
        {config.label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        config.bg,
        "border-transparent",
        className
      )}
    >
      <div className="relative">
        <Icon className={cn("w-4 h-4", config.text)} strokeWidth={1.5} />
        {status === "connected" && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[12px] font-medium", config.text)}>
            {config.label}
          </span>
          {provider && (
            <span className="text-[11px] text-gray-muted">via {provider}</span>
          )}
        </div>
        {syncLabel && (
          <p className="text-[10px] text-gray-muted mt-0.5">{syncLabel}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Utility to determine connection status based on last sync time
 */
export function getConnectionStatus(
  connected: boolean,
  lastSync?: string | Date | null,
  staleThresholdHours = 24
): ConnectionStatus {
  if (!connected) return "disconnected";
  if (!lastSync) return "connected"; // No sync tracking, assume OK

  const syncTime = new Date(lastSync);
  const hoursSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync > staleThresholdHours * 2) return "error";
  if (hoursSinceSync > staleThresholdHours) return "stale";
  return "connected";
}
