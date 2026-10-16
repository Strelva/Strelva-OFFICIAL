import { XaNotFound } from "@/experience/states/XaStates";

/**
 * Public 404 in XA (October 16): one headline, one ink pill back to Strelva,
 * text links to the workspace and sign-in. The dashboard-context 404 lives
 * in src/app/dashboard/not-found.tsx and keeps an owner inside the app.
 */
export default function NotFound() {
  return <XaNotFound />;
}
