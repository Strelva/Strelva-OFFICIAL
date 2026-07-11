import { cookies } from "next/headers";
import { isSuperAdmin } from "./auth";

/**
 * Super-admin "inspect mode". Lets an operator pull up any client's dashboard —
 * including feature-gated surfaces the client hasn't enabled — as a read-only
 * preview, WITHOUT touching the client's live `features[]` or what the client sees.
 *
 * The cookie only expresses INTENT. It NEVER grants anything on its own:
 * `isInspecting()` re-verifies `isSuperAdmin()` server-side on every call, so a
 * non-super-admin who sets `strelva_inspect=1` by hand gets zero bypass. Fail-closed.
 */
export const INSPECT_COOKIE = "strelva_inspect";

/**
 * True only when the inspect cookie is set AND the caller is a super-admin right
 * now. isSuperAdmin() is the real gate — the cookie is intent, not authorization.
 * Any error resolves to false (fail-closed).
 */
export async function isInspecting(): Promise<boolean> {
  try {
    const jar = await cookies();
    if (jar.get(INSPECT_COOKIE)?.value !== "1") return false;
    return await isSuperAdmin();
  } catch {
    return false;
  }
}
