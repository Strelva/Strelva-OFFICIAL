import { redirect } from "next/navigation";

export default function DashboardContentRedirect() {
  redirect("/dashboard/site");
}
