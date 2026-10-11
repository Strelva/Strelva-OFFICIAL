/** Recover a removed control without overriding deliberate keyboard movement. */
export interface FocusRecovery {
  recover(target: HTMLElement | null, preferTarget?: boolean): void;
  cancel(): void;
}
export function beginFocusRecovery(scope: HTMLElement | null): FocusRecovery {
  const source = document.activeElement;
  let moved = !source || !scope?.contains(source);
  const observe = (event: FocusEvent) => { if (event.target !== source) moved = true; };
  document.addEventListener("focusin", observe);
  const cancel = () => document.removeEventListener("focusin", observe);
  return {
    cancel,
    recover(target, preferTarget = false) {
      cancel();
      const active = document.activeElement;
      const destination = !preferTarget && source instanceof HTMLElement && source.isConnected ? source : target;
      if (!moved && (active === source || active === document.body || !active?.isConnected) && !destination?.matches(":disabled")) destination?.focus();
    },
  };
}
