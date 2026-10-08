import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
/** Signed inquiry handoff. Read-only until the customer explicitly posts one time. */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error }: { choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string }) {
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:py-16"><div className="mx-auto max-w-[560px]">
    <h1 className="font-display text-[32px] font-medium leading-tight">{choice?.booking?.status === "confirmed" ? "Your appointment" : choice?.booking ? "Your appointment request" : "Choose an appointment time"}</h1>
    {!choice ? <p role={unavailable ? "alert" : undefined} className="mt-4 text-gray-muted">{unavailable ? "These times couldn't load. Reload in a minute, or reply to the business for help." : "This link expired or these times are no longer available. Reply to the business for fresh times."}</p> : <>
      <p className="mt-4 text-gray-muted">{choice.offer.serviceName}. {choice.booking ? choice.booking.status === "requested" ? "Your request is saved. The business decides whether to confirm it." : choice.booking.status === "confirmed" ? "The business confirmed your appointment." : "This appointment is no longer waiting for confirmation." : "Pick a time to request an appointment. The business must confirm it."}</p>
      {error && <p role="alert" className="mt-4 text-critical">{error === "rate" ? "Wait a minute before trying again." : "That time couldn't be requested. Reload for current times, or reply to the business. Nothing was confirmed."}</p>}
      <Card padding="lg" className="mt-8">
        {choice.booking ? <dl className="grid gap-3 text-sm"><dt className="text-gray-muted">When</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: choice.booking.timeZone }).format(new Date(choice.booking.start))}</dd><dt className="text-gray-muted">Status</dt><dd>{choice.booking.status === "requested" ? "Waiting for the business to confirm" : choice.booking.status}</dd></dl>
          : <div className="grid gap-4">{choice.offer.slots.map((slot, index) => <form key={slot.start} method="post" action={actionUrl} className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm">{slot.label}</p><input type="hidden" name="slot" value={index} /><Button type="submit" variant="secondary">Request this time</Button></form>)}</div>}
      </Card>
    </>}
  </div></main>;
}
