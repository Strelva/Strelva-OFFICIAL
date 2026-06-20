"use client";

import { timeAgo } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { IntegrationStatus, IntelligenceStatus } from "@/lib/integration-registry";

type ConnectionStatus = IntegrationStatus | IntelligenceStatus | "stale" | "error" | "disconnected";

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
  not_configured: {
    icon: RefreshCw,
    label: "Not configured",
    bg: "bg-gray-bg",
    text: "text-gray-muted",
    dot: "bg-gray-muted",
  },
  sync_failed: {
    icon: AlertCircle,
    label: "Sync failed",
    bg: "bg-red-500/10",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  needs_reauth: {
    icon: AlertCircle,
    label: "Needs reauth",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    dot: "bg-amber-500",
  },
  coming_soon: {
    icon: Clock,
    label: "Coming soon",
    bg: "bg-gray-bg",
    text: "text-gray-muted",
    dot: "bg-gray-muted",
  },
  unknown: {
    icon: AlertCircle,
    label: "Unknown",
    bg: "bg-gray-bg",
    text: "text-gray-muted",
    dot: "bg-gray-muted",
  },
  no_signal: {
    icon: RefreshCw,
    label: "Setup needed",
    bg: "bg-gray-bg",
    text: "text-gray-muted",
    dot: "bg-gray-muted",
  },
  signal_available: {
    icon: Clock,
    label: "Available signal",
    bg: "bg-[rgba(255,255,255,0.05)]",
    text: "text-gray-fg",
    dot: "bg-gray-fg",
  },
  ai_using_it: {
    icon: CheckCircle2,
    label: "Ready to use",
    bg: "bg-accent-dim",
    text: "text-accent",
    dot: "bg-accent",
  },
  needs_attention: {
    icon: AlertCircle,
    label: "Needs attention",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    dot: "bg-amber-500",
  },
  can_act_here: {
    icon: CheckCircle2,
    label: "Can act",
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

  const syncLabel = lastSync ? `Last sync ${timeAgo(new Date(lastSync).getTime())}` : null;

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
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
  if (!connected) return "not_configured";
  if (!lastSync) return "connected"; // No sync tracking, assume OK

  const syncTime = new Date(lastSync);
  const hoursSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync > staleThresholdHours * 2) return "sync_failed";
  if (hoursSinceSync > staleThresholdHours) return "stale";
  return "connected";
}
