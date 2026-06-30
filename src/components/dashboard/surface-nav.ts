import {
  House,
  MessageCircle,
  Globe,
  MapPin,
  BarChart3,
  Star,
  Activity,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { SurfaceId } from "@/lib/dashboard-surfaces";

/** Icon per conditional dashboard surface. Shared by the desktop sidebar + mobile bar. */
export const SURFACE_ICONS: Record<SurfaceId, LucideIcon> = {
  "today": House,
  "ask-ai": MessageCircle,
  "website": Globe,
  "store": ShoppingBag,
  "google-business": MapPin,
  "analytics": BarChart3,
  "reviews": Star,
  "health": Activity,
};

/** Group display labels for the conditional nav. */
export const GROUP_LABELS: Record<"manage" | "presence", string> = {
  manage: "Manage",
  presence: "Your presence",
};

/**
 * Route prefixes that mark a tab active. Website folds Site/Content/Assets behind
 * one tab; the rest map 1:1. Visiting any listed route lights its parent tab.
 */
export const SURFACE_MATCH: Record<SurfaceId, string[]> = {
  "today": [],
  "ask-ai": ["/dashboard/chat"],
  "website": ["/dashboard/site", "/dashboard/build", "/dashboard/collections", "/dashboard/content", "/dashboard/assets", "/dashboard/history"],
  "store": ["/dashboard/store"],
  "google-business": ["/dashboard/google"],
  "analytics": ["/dashboard/reports"],
  "reviews": ["/dashboard/reviews"],
  "health": ["/dashboard/health"],
};
