"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { strelvaUndoWindowMs } from "@/platform/infra/motion";

/**
 * A yes with a real Undo where the server keeps no reversal (agreeing to a
 * price, offering an app, changing who looks after it). The yes goes live on
 * screen at once and the Undo pill rises; the request is sent only when the
 * Undo window ends. Undo inside the window means nothing was ever sent, so
 * nothing needs taking back. Leaving the page inside the window sends
 * nothing either: an agreement is never recorded that the person couldn't
 * still take back.
 *
 * `windowMs` 0 sends at once (tests and callers that already asked).
 */
export function useHeldYes(commit: () => void, windowMs = strelvaUndoWindowMs) {
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );
  const send = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
    latest.current();
  }, []);
  const hold = useCallback(() => {
    if (timer.current) return;
    if (windowMs <= 0) {
      latest.current();
      return;
    }
    setHeld(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHeld(false);
      latest.current();
    }, windowMs);
  }, [windowMs]);
  const undo = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
  }, []);
  /** `send` is for XaYes's onUndoExpired: the drain bar ending sends now, the timer is the fallback. */
  return { held, hold, undo, send };
}
