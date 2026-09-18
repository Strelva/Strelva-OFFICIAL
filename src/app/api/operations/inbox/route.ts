import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listAuthorizedOperationalInbox, listOperationalExceptions } from "@/products/operations/inbox";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}

async function actor() {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user?.id || !email || !user.email_confirmed_at) return null;
  return { userId: user.id, verifiedEmail: email };
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const current = await actor();
  if (!current) return json({ error: "Sign in with a confirmed email." }, 401);
  const view = new URL(request.url).searchParams.get("view") ?? "inbox";
  if (view !== "inbox" && view !== "internal") return json({ error: "This inbox view is unavailable." }, 400);
  try {
    if (view === "internal") {
      if (!(await isSuperAdminUser(current.userId))) return json({ error: "This internal work view is unavailable to your account." }, 403);
      const [exceptions, inbox] = await Promise.all([
        listOperationalExceptions(),
        listAuthorizedOperationalInbox(current),
      ]);
      return json({ exceptions, inbox });
    }
    return json({ inbox: await listAuthorizedOperationalInbox(current) });
  } catch {
    return json({ error: "The operational inbox could not be loaded." }, 503);
  }
}
