import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";

const root = process.cwd();
const frame = () => readFileSync(path.join(root, "src/experience/app-frame/AppFrame.tsx"), "utf8");
const frameStyles = () => readFileSync(path.join(root, "src/experience/app-frame/app-frame.module.css"), "utf8");
const managedShell = () => readFileSync(path.join(root, "src/components/dashboard/ConversationShell.tsx"), "utf8");
const workspaceSignOut = () => readFileSync(path.join(root, "src/experience/workspace/WorkspaceSignOutButton.tsx"), "utf8");

describe("shared app frame accessibility contract", () => {
  it("keeps collapsed navigation and mobile modal surfaces out of competing focus trees", () => {
    const source = frame();
    const styles = frameStyles();

    expect(source).toContain("useSyncExternalStore");
    expect(source).toContain("getServerHydrationSnapshot");
    expect(source).toContain("disabled={!hydrationReady}");
    expect(source).toContain("showNavigationToggle = true");
    expect(source).toContain("navigation && showNavigationToggle");
    expect(source).toContain("inert={inactiveNavigation || mobileRailModal || undefined}");
    expect(source).toContain("inert={mobileNavigationModal || undefined}");
    expect(source).toContain("visibleFocusableElements(navigationRef.current)[0]?.focus()");
    expect(source).toContain("event.key === \"Escape\"");
    expect(source).toContain("aria-labelledby={`${rightRailId}-title`}");
    expect(source).toContain("aria-modal={mobileRailModal || undefined}");
    expect(styles).toContain("visibility: hidden;");
    expect(styles).toContain("z-index: 50;");
  });

  it("keeps managed chat contextual and leaves the full chat route canonical", () => {
    const source = managedShell();

    expect(source).toContain("OptionalManagedDiscussion");
    expect(source).toContain('effectivePathname === "/dashboard/chat"');
    expect(source).toContain("<StrelvaShell");
    expect(source).toContain("<ManagedNavigation");
    expect(source).toContain('aria-controls="managed-discussion"');
    expect(source).toContain("useHydrationReady");
    expect(source).toContain("disabled={!hydrationReady}");
    expect(readFileSync(path.join(root, "src/experience/workspace/WorkspaceLayout.tsx"), "utf8")).toContain("<StrelvaShell");
    expect(source).not.toContain('rightRail={<ChatPanel');
  });

  it("keeps personal workspace sign-out discoverable without carrying handoff state", () => {
    const source = workspaceSignOut();
    const shellProps: ComponentProps<typeof StrelvaShell> = {
      title: "Your Strelva",
      accountName: "Alex",
      accountDetail: "alex@example.com",
      signOut: createElement("button", { type: "button" }, "Sign out"),
      children: createElement("p", null, "Workspace"),
    };
    const html = renderToStaticMarkup(createElement(StrelvaShell, shellProps));

    expect(html).toContain('aria-label="Strelva navigation"');
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Workspace utilities"');
    for (const label of ["Home", "Work", "Ongoing", "People &amp; access", "Settings", "New", "Search", "Examples", "Help"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('href="/workspace?view=ongoing"');
    expect(html).toContain('href="/workspace?view=settings"');
    expect(html).toContain('href="/workspace?view=work&amp;search=1"');
    expect(html).toContain('href="/workspace/account"');
    expect(html).toContain("Sign out");
    expect(source).toContain("createBrowserSupabase");
    expect(source).toContain("supabase.auth.signOut()");
    expect(source).toContain('key?.startsWith("strelva:workspace-")');
    expect(source).toContain('key?.startsWith("strelva:public-result-")');
    expect(source).toContain('router.replace("/sign-in?next=%2Fworkspace")');
    expect(source).toContain("router.refresh()");
    expect(source).toContain('Sign out');
  });
});
