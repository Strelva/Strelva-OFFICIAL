"use client";

import { useRouter, usePathname } from "next/navigation";
import { XaSegmented } from "@/components/ui/strelva/Xa";

/** Switch Reports between the weekly and the monthly recap. Updates `?view=`
 *  so the server renders the chosen recap. Only shown when a monthly exists. */
export function ReportsViewToggle({ current }: { current: "weekly" | "monthly" }) {
  const router = useRouter();
  const pathname = usePathname();
  return <XaSegmented label="Which recap" value={current} onChange={(view) => router.push(`${pathname}?view=${view}`)} options={[
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ]} />;
}
