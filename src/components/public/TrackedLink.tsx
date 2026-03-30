"use client";

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  event: string;
};

export function TrackedLink({
  href,
  event,
  children,
  ...props
}: TrackedLinkProps) {
  const handleClick = () => {
    // Fire-and-forget beacon — don't block navigation
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([JSON.stringify({ event })], { type: "application/json" })
      );
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
        keepalive: true,
      }).catch(() => {});
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
