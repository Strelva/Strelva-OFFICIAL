"use client";

import { DashLoading } from "./xa/DashboardXa";

export function QueueSkeleton() {
  return <DashLoading label="Loading Needs you" rows={3} />;
}
