import { redirect } from "next/navigation";

// The marketing guides now live at /guides (real content). This legacy
// placeholder route redirects there so there is one home for them.
export default function MBlogRedirect() {
  redirect("/guides");
}
