"use client";

import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import styles from "./app-frame.module.css";

export interface AppFrameProps {
  /** Existing product navigation. It is never interpreted by the frame. */
  navigation?: ReactNode;
  /** Optional icon-only navigation shown while the primary rail is collapsed. */
  collapsedNavigation?: ReactNode;
  navigationLabel?: string;
  /** Whether the frame renders its built-in desktop navigation toggle. */
  showNavigationToggle?: boolean;
  /** Optional controlled collapse state. Omit to use the browser-local preference. */
  navigationCollapsed?: boolean;
  onNavigationToggle?: (collapsed: boolean) => void;
  navigationStorageKey?: string;
  defaultNavigationCollapsed?: boolean;
  /** Whether the caller's mobile navigation overlay is open. */
  navigationOpen?: boolean;
  onCloseNavigation?: () => void;
  navigationTriggerRef?: RefObject<HTMLButtonElement | null>;
  /** Product-owned top bar content. */
  header?: ReactNode;
  /** A route-level notice (for example, an authenticated inspect banner). */
  notice?: ReactNode;
  /** The concrete product work. The frame does not inspect or alter it. */
  children: ReactNode;
  /** Optional contextual discussion/result rail. */
  rightRail?: ReactNode;
  rightRailId?: string;
  rightRailTitle?: string;
  rightRailOpen?: boolean;
  onCloseRightRail?: () => void;
  rightRailTriggerRef?: RefObject<HTMLButtonElement | null>;
  contentId?: string;
  className?: string;
}

const DEFAULT_NAVIGATION_STORAGE_KEY = "strelva:app-frame-navigation-collapsed";
const FOCUSABLE_SELECTOR =
  "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function subscribeToHydration() {
  return () => {};
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

/**
 * Keep server-rendered controls inert until React has attached their handlers.
 * The server snapshot stays false so the first client render matches the HTML;
 * React switches to the client snapshot immediately after hydration.
 */
export function useHydrationReady() {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

function readCollapsedPreference(key: string | undefined, fallback: boolean): boolean {
  if (typeof window === "undefined" || !key) return fallback;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return fallback;
  }
}

function useViewportMatch(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    // The server and first client render intentionally use the same fallback;
    // the actual viewport is applied after hydration.
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function visibleFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest("[hidden]")) return false;
    return element.getClientRects().length > 0;
  });
}

/**
 * Browser-safe composition frame shared by product shells.
 *
 * It knows only about layout slots and disclosure state. Product navigation,
 * permissions, route names, and conversation operations remain owned by the
 * caller. This lets managed tenants adopt the result-first navigation shape
 * without importing private-workspace behavior or changing their APIs.
 */
export function AppFrame({
  navigation,
  collapsedNavigation,
  navigationLabel = "Application navigation",
  showNavigationToggle = true,
  navigationCollapsed,
  onNavigationToggle,
  navigationStorageKey = DEFAULT_NAVIGATION_STORAGE_KEY,
  defaultNavigationCollapsed = false,
  navigationOpen = false,
  onCloseNavigation,
  navigationTriggerRef,
  header,
  notice,
  children,
  rightRail,
  rightRailId = "app-frame-right-rail",
  rightRailTitle = "Discussion",
  rightRailOpen = false,
  onCloseRightRail,
  rightRailTriggerRef,
  contentId = "app-frame-main",
  className,
}: AppFrameProps) {
  const controlledNavigation = navigationCollapsed !== undefined;
  const [storedNavigationCollapsed, setStoredNavigationCollapsed] = useState(defaultNavigationCollapsed);
  const closeRailRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const previousNavigationFocusRef = useRef<HTMLElement | null>(null);
  const previousRailFocusRef = useRef<HTMLElement | null>(null);
  const wasMobileNavigationOpenRef = useRef(false);
  const navigationPreferenceInteractedRef = useRef(false);
  const hydrationReady = useHydrationReady();
  const collapsed = controlledNavigation ? navigationCollapsed : storedNavigationCollapsed;
  const railIsOpen = Boolean(rightRail && rightRailOpen);
  const isDesktopViewport = useViewportMatch("(min-width: 1024px)");
  const isNavigationOverlayViewport = useViewportMatch("(max-width: 1023px)");
  const isMobileRailViewport = useViewportMatch("(max-width: 767px)");
  const inactiveNavigation = Boolean(collapsed && isDesktopViewport);
  const mobileNavigationModal = Boolean(navigationOpen && isNavigationOverlayViewport);
  const mobileRailModal = Boolean(railIsOpen && isMobileRailViewport);

  useEffect(() => {
    if (controlledNavigation) return;
    if (navigationPreferenceInteractedRef.current) return;
    // The server and first client render intentionally agree on the default;
    // the saved preference is applied only after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoredNavigationCollapsed(
      readCollapsedPreference(navigationStorageKey, defaultNavigationCollapsed),
    );
  }, [controlledNavigation, defaultNavigationCollapsed, navigationStorageKey]);

  useEffect(() => {
    if (!railIsOpen) return;
    previousRailFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    // A right rail is a full-screen replacement on narrow screens. Focusing its
    // close control makes that transition keyboard-visible and reversible.
    const frame = window.requestAnimationFrame(() => closeRailRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [railIsOpen]);

  useEffect(() => {
    if (!mobileNavigationModal) {
      if (!wasMobileNavigationOpenRef.current) return;
      wasMobileNavigationOpenRef.current = false;
      const frame = window.requestAnimationFrame(() => {
        const trigger = navigationTriggerRef?.current;
        if (trigger && trigger.getClientRects().length > 0) {
          trigger.focus();
        } else {
          previousNavigationFocusRef.current?.focus();
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }

    wasMobileNavigationOpenRef.current = true;
    previousNavigationFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => {
      visibleFocusableElements(navigationRef.current)[0]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileNavigationModal, navigationTriggerRef]);

  function toggleNavigation() {
    navigationPreferenceInteractedRef.current = true;
    const next = !collapsed;
    if (!controlledNavigation) setStoredNavigationCollapsed(next);
    onNavigationToggle?.(next);
    if (!controlledNavigation && navigationStorageKey) {
      try {
        window.localStorage.setItem(navigationStorageKey, String(next));
      } catch {
        // A blocked preference must not affect navigation or product work.
      }
    }
  }

  function closeRail() {
    onCloseRightRail?.();
    window.requestAnimationFrame(() => {
      const trigger = rightRailTriggerRef?.current;
      if (trigger && trigger.getClientRects().length > 0) {
        trigger.focus();
      } else {
        previousRailFocusRef.current?.focus();
      }
    });
  }

  function handleNavigationKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!mobileNavigationModal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseNavigation?.();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = visibleFocusableElements(navigationRef.current);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleRailKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!railIsOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeRail();
      return;
    }
    if (!mobileRailModal || event.key !== "Tab") return;

    const focusable = visibleFocusableElements(event.currentTarget);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ""}`}
      data-navigation-collapsed={collapsed}
      data-navigation-open={mobileNavigationModal}
      data-right-rail-open={railIsOpen}
      data-dashboard
    >
      {navigation && (
        <div
          ref={navigationRef}
          className={styles.navigation}
          aria-label={navigationLabel}
          aria-modal={mobileNavigationModal || undefined}
          role={mobileNavigationModal ? "dialog" : undefined}
          aria-hidden={inactiveNavigation || undefined}
          inert={inactiveNavigation || mobileRailModal || undefined}
          onKeyDown={handleNavigationKeyDown}
        >
          {navigation}
        </div>
      )}
      {collapsedNavigation && collapsed && (
        <aside className={styles.collapsedNavigation} aria-label={`${navigationLabel} (collapsed)`}>
          {collapsedNavigation}
        </aside>
      )}

      <div className={styles.body} inert={mobileNavigationModal || undefined}>
        {(header || navigation) && (
          <div className={styles.header} role="banner">
            {navigation && showNavigationToggle && (
              <button
                type="button"
                className={styles.navigationToggle}
                onClick={toggleNavigation}
                disabled={!hydrationReady}
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                aria-expanded={!collapsed}
                title={collapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.5} /> : <PanelLeftClose size={17} strokeWidth={1.5} />}
              </button>
            )}
            <div className={styles.headerContent}>{header}</div>
          </div>
        )}
        {notice}

        <div
          className={styles.columns}
          data-right-rail={railIsOpen ? "open" : "closed"}
        >
          <main id={contentId} className={styles.main} data-frame-main>
            {children}
          </main>
          {rightRail && (
            <aside
              id={rightRailId}
              className={styles.rightRail}
              aria-label={rightRailTitle}
              aria-labelledby={`${rightRailId}-title`}
              aria-modal={mobileRailModal || undefined}
              role={mobileRailModal ? "dialog" : undefined}
              onKeyDown={handleRailKeyDown}
              hidden={!railIsOpen}
            >
              <div className={styles.rightRailHeader}>
                <h2 id={`${rightRailId}-title`}>{rightRailTitle}</h2>
                <button
                  ref={closeRailRef}
                  type="button"
                  className={styles.closeButton}
                  onClick={closeRail}
                  disabled={!hydrationReady}
                  aria-label={`Close ${rightRailTitle}`}
                >
                  <X size={17} strokeWidth={1.5} />
                </button>
              </div>
              <div className={styles.rightRailContent}>{rightRail}</div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
