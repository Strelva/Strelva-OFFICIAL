import { redirect } from "next/navigation";

export default function OwnershipPage() {
  redirect("/dashboard/settings#ownership");
}
