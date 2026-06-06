# First Recurring Pitch — Lead Rescue (Intake → CRM, the #1 workflow)

> **DECISION (2026-06-05): Rohlax / Chelsea is NOT the target for this pitch.**
> Chelsea is very early. She pays a **one-time real payment for her website build**
> (`/pay/rohlax`, **$500–$1,000, default $500** — she picks within the range); ongoing
> site + admin stay free (no subscription, no monthly fees). That one-time is **the
> payment, not a gift/courtesy** — and it is the ONLY thing she pays. **Do not pitch
> her anything recurring.** She is a reference / first-proof relationship, not the
> first-MRR test. Note: $500 is a knowing first-client price, far below the ~$2–8k a
> custom build is worth — don't let it become the default price for future clients.
>
> This doc is now a **reusable playbook** for the *first recurring "yes"* — taken to a
> **different, more-ready client** with acute enough pain that a monthly price feels
> fair to *them*. "[Name]" below is a placeholder for that next warm client; the
> original example was Chelsea.

> Goal: the lowest-effort path to the first recurring "yes." This is a PRE-SALE
> (sell, then build the concierge version), not a build-first. One paid yes from a
> real local business reorders the whole strategy. Outcome to log: the client pays a
> recurring price / declines / counteroffers.

## Who to target (ICP for the first recurring yes)
- Appointment-based / inquiry-driven local business (wellness, services); the **owner is the bottleneck**.
- A warm-enough relationship that you can have a direct money conversation.
- Ideally already on a Strelva free site, so the **weekly receipt** ("people who found you / booking clicks") is a live, true hook.
- Far enough along that **losing leads costs them real money this month** — the pain is acute, not theoretical.
- **NOT** someone so early a recurring bill would strain the relationship — that's Rohlax; keep her free.
- Clean separation: the **website + admin stay free for life** (the front door); this is a
  **separate paid service** (the machinery). Keeps the "free for life" framing intact and makes a paid ask consistent.

## Prep (do before sending — ~20 min, no build)
1. **Pull the client's REAL numbers** from the control plane (`weekly-brief.ts` / the event store
   for their tenant): last 30 days of site inquiries / booking clicks / "found you".
   **Do not invent these — the real number IS the moat.** Fill the `[ ]` blanks below.
2. Get their real **first-visit price** (to size the leak honestly).
3. *(Optional, helps close)* a 30-sec Loom of one inquiry flowing into a single place with
   an auto-reply + a nudge — concierge/manual is fine for the demo.

## The warm message (text/email — fill the blanks, send as-is)
> Hey [Name] — quick one. Your weekly receipt last month showed **[N]** people clicked to
> book and **[M]** reached out through the site. Right now nothing's catching the ones who
> click or message but don't finish — they just go cold, and at **[~$X]** a first visit that
> adds up fast.
>
> I want to build you something that fixes it: every inquiry (site, booking, missed call)
> lands in one place and gets an instant friendly reply, plus a nudge if they go quiet — so
> a new client never slips through. I build it and run it; you don't touch anything, and
> nothing goes out without your OK.
>
> Your site + admin stay free for life, that doesn't change. This is a separate thing — call
> it **[Lead Rescue]**. I'd run it for **$[X]/mo**, no setup, cancel anytime. If it doesn't
> more than pay for itself the first month, we kill it.
>
> Want me to turn it on? I can have it live this week.

(Plain, texting-tone, data-led, named, risk-reversed. ~120 words; split into 2 texts if needed.)

## The scoped offer (what "[Lead Rescue]" is)
- **What it does:** captures every new-client inquiry (site form, booking click, missed call)
  into one place → instant auto-reply → follow-up nudge if they don't respond → nothing
  publishes/sends without their OK (governance).
- **The promise:** "I build it and run it. You never touch a tool. Site + admin stay free."
- **Price (first-yes-friendly, recommend):** **$150–300/mo, no setup, cancel anytime.** The
  point is a *recurring yes*, not max ACV. Frame: "less than one recovered client a month."
- **Delivery (lowest-effort):** run it **concierge first** — capture+chase inquiries
  semi-manually (or a thin script over the existing event store) for the first weeks, then
  harden it. Don't build the full thing before they say yes.
- **Position:** sell the **outcome** (recovered clients / revenue) + **local trust + "I run
  it"** — NOT "a governed automation" (invisible at point of sale). You're not selling
  software; you're selling "a new client never slips through, and I handle it."

## What the answer teaches (log either way)
- **Yes (any recurring $):** Custom Software has a pulse; the ladder is real; build the
  hardened version + take it to the next warm client. First MRR from the workflows division.
- **Counteroffer / "do it free":** the value's real but the price model isn't — note the gap.
- **No / "I'm fine":** the pain isn't acute enough for *them*; try a different client — and
  weigh the kill criteria in `workflows-valueprops.md` §5.
- Either way: this is the **D1 reality-contact** that's been open since the April bottleneck.
  One real paid conversation beats another build.

## Hard rule
Never fabricate a client's numbers, a screenshot, or a quote. If you don't have the real
`[N]/[M]`, pull them first — a made-up hook destroys the one advantage (warm, true data) that
the whole pitch rests on.
