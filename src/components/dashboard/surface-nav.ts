import {
  House,
  MessageCircle,
  Globe,
  MapPin,
  BarChart3,
  Star,
  CalendarDays,
  Users,
  Ticket,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import type { SurfaceId } from "@/lib/dashboard-surfaces";

/** Icon per conditional dashboard surface. Shared by the desktop sidebar + mobile bar. */
export const SURFACE_ICONS: Record<SurfaceId, LucideIcon> = {
  "today": House,
  "ask-ai": MessageCircle,
  "website": Globe,
  "google-business": MapPin,
  "analytics": BarChart3,
  "reviews": Star,
  // Vertical-set (wellness) member surfaces.
  "schedule": CalendarDays,
  "members": Users,
  "packages": Ticket,
  "roster": ClipboardList,
};

/** Group display labels for the conditional nav. `set` heads the vertical-set tabs. */
export const GROUP_LABELS: Record<"manage" | "presence" | "set", string> = {
  manage: "Manage",
  presence: "Your presence",
  set: "Business tools",
};

/**
 * Route prefixes that mark a tab active. Website folds Site/Content/Assets/Store
 * behind one tab; Analytics folds Reports/Health. The rest map 1:1. Visiting any
 * listed route lights its parent tab.
 */
export const SURFACE_MATCH: Record<SurfaceId, string[]> = {
  "today": [],
  "ask-ai": ["/dashboard/chat"],
  "website": ["/dashboard/site", "/dashboard/collections", "/dashboard/content", "/dashboard/assets", "/dashboard/history", "/dashboard/store"],
  "google-business": ["/dashboard/google"],
  "analytics": ["/dashboard/analytics", "/dashboard/reports", "/dashboard/health"],
  "reviews": ["/dashboard/reviews"],
  // Vertical-set (wellness) member surfaces — each maps 1:1 to its route.
  "schedule": ["/dashboard/schedule"],
  "members": ["/dashboard/members"],
  "packages": ["/dashboard/packages"],
  "roster": ["/dashboard/roster"],
};
