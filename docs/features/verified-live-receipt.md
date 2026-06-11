# Verified-Live Receipt

Picked 2026-06-10 (features round). Founder reason: part of retention-spine sweep; ICP locked as Angi-refugee plumbing/HVAC.

**Type:** proof. **Shape:** proactive feed (rides the existing Monday report) + audit trail.
**Asset it stands on:** the per-tenant event stream (`src/lib/events.ts`) and the existing weekly-report pipeline — accumulated, non-derivable history of what changed and when.

## What it is
Every outbound change Strelva makes — site section publish, blog post, (later) GBP edit, review reply — gets a **post-publish live verification pass**: re-fetch the public surface after publishing, confirm the change is actually visible, record `verified_live_at` (+ evidence: URL checked, snippet matched) as an event. The Monday report renders it in plain English: "Hours updated Tuesday — checked live Wednesday 9:04am."

## Why the user's own AI can't do this
Research (2026-06-10 scouts): platform AI does the visible action and silently fails — Google sat 12,752 AI review replies in an invisible REJECTED state (localsearchforum dataset); AI browsers strip referrers so AI summaries misreport traffic. Verification requires credentialed access + owning the outcome over time — structurally outside a $20/mo consumer agent.

## Frame / quotable
Main-screen claim: the receipt is evidence, not a summary. Quotable: "Everyone's AI says it posted your update. Ours checks, and shows you the timestamp."

## Build notes
- New event kind (e.g. `change_verified` / `change_verify_failed`) emitted by a verification step after `update_section` publishes and after revalidation webhook success; re-fetch via the public v1 content route or the client site URL.
- Failures surface in the owner dashboard review queue AND Jacob's Slack — a failed verification is the product catching itself; never hide it.
- Report renderer (`src/lib/reports.ts` / `weekly-brief.ts`): add verified lines with timestamps; claims-safe fallback already exists, keep it.
- Done = proven: a real tenant change shows "verified live" with timestamp in a generated report; a forced failure shows in queue + Slack. Screenshot both.

## Research basis (dated)
2026-06-10 scout briefs (in-session): GBP silent rejections; SiteGround trust backlash; attribution decay (GA4 AI channel May 13 2026, Atlas referrer stripping).
