"use client";

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  event: string;
  extraEvents?: string[];
};

export function TrackedLink({
  href,
  event,
  extraEvents,
  children,
  ...props
}: TrackedLinkProps) {
  const handleClick = () => {
    const events = [event, ...(extraEvents || [])];
    for (const e of events) {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/track",
          new Blob([JSON.stringify({ event: e })], { type: "application/json" })
        );
      } else {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: e }),
          keepalive: true,
        }).catch(() => {});
      }
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
