"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Local session ownership only. Each website transport still owns its exact
 * acknowledgement and whether reconciliation reads or replays a command. */
export function useWebsiteAttempt<Command = never>(authority: string) {
  const [busy, renderBusy] = useState(false);
  const [needsReload, renderUnknown] = useState(false);
  const inFlight = useRef(false), unresolved = useRef(false), mounted = useRef(true);
  const command = useRef<Command | null>(null);
  const permission = useRef({ authority, revision: 0 });
  useLayoutEffect(() => {
    if (permission.current.authority !== authority) permission.current = { authority, revision: permission.current.revision + 1 };
  }, [authority]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function setBusy(value: boolean) {
    inFlight.current = value;
    if (mounted.current) renderBusy(value);
  }
  function requireReload(value: boolean) {
    unresolved.current = value;
    if (mounted.current) renderUnknown(value);
  }
  function begin(allowed: boolean, reconciliation = false, submitted?: Command) {
    if (!mounted.current || !allowed || inFlight.current || (unresolved.current && !reconciliation)) return null;
    const ticket = { revision: permission.current.revision, wasUnknown: unresolved.current };
    if (submitted !== undefined) command.current = structuredClone(submitted);
    setBusy(true);
    return ticket;
  }
  type Ticket = NonNullable<ReturnType<typeof begin>>;
  function current(ticket: Ticket) { return mounted.current && permission.current.revision === ticket.revision; }
  function accept(ticket: Ticket) {
    if (!mounted.current) return false;
    if (!current(ticket)) throw new Error("Your access changed while the website result was being checked.");
    requireReload(false);
    return true;
  }
  function refuse(ticket: Ticket) {
    // A later refusal cannot prove an earlier uncertain command never ran.
    if (ticket.wasUnknown || !current(ticket)) return false;
    command.current = null;
    requireReload(false);
    return true;
  }
  return { busy, needsReload, inFlight, unresolved, mounted, command, permission, begin, current, accept, refuse, requireReload, setBusy, finish: () => setBusy(false) };
}
