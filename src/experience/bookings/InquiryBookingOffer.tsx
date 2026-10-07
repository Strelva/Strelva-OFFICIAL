import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
/** Plain customer form: keyboard usable, never preselects a commitment. */
export function InquiryBookingOffer({ offer, actionUrl, error }: { offer: Offer | null; actionUrl: string; error?: boolean }) {
  const format = offer ? new Intl.DateTimeFormat("en-US", { timeZone: offer.timeZone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black"><div className="mx-auto max-w-[560px]">
    <h1 className="font-display text-[32px] font-medium leading-tight">{!offer ? "This suggestion has expired" : offer.booked ? "Your request is received" : "Choose a time to request"}</h1>
    <p className="mt-3 text-base leading-7 text-gray-muted">{!offer ? "Reply to the business to ask for new times." : offer.booked ? "The business will confirm your requested time. It is not confirmed yet." : "Pick a time below. The business will confirm your request."}</p>
    {error ? <p role="alert" className="mt-4 text-critical">This time could not be requested. It may have just been taken. Reply to the business for new times.</p> : null}
    {offer && !offer.booked ? <Card padding="lg" className="mt-8"><form method="post" action={actionUrl}>
      <fieldset><legend className="text-base font-medium">{offer.serviceName}</legend><p className="mt-2 text-sm text-gray-muted">Times in {offer.timeZone}</p>
        <div className="mt-4 grid gap-3">{offer.slots.map(slot => <label key={slot.start} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-gray-border p-3 focus-within:outline-2 focus-within:outline-accent"><input type="radio" name="start" value={slot.start} required className="h-4 w-4"/><span>{format!.format(new Date(slot.start))}</span></label>)}</div>
      </fieldset>
      <Button type="submit" className="mt-6">Request this time</Button>
    </form></Card> : null}
  </div></main>;
}
