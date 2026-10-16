import type { LeadRecord } from "@/lib/leads";
import { XaInitial, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashPage } from "./xa/DashboardXa";
import styles from "./xa/dashboard-xa.module.css";

interface LeadsPanelProps {
  leads: LeadRecord[];
}

function formatWhen(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Humanize a raw source tag like "contact-form" -> "Contact form". */
function sourceLabel(source: string): string {
  const s = source.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Inquiries from the website (GLOSSARY: Inquiry, never lead). One open list:
 * who wrote, what they asked, when, and a reply that opens the owner's own
 * email. Nothing is sent from here.
 */
/** A phone number someone typed into their message, so a lead with no email still has a next step. */
function phoneIn(message?: string | null): string | null {
  const match = message?.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return match ? match[0].trim() : null;
}

export function LeadsPanel({ leads }: LeadsPanelProps) {
  if (leads.length === 0) {
    return (
      <DashEmpty
        pose="adds"
        title="No one has written yet."
        job="Watching your website's contact form for the first inquiry"
      >
        When someone writes through your site, their name and what they asked land here, and you reply from your own email.
      </DashEmpty>
    );
  }

  return (
    <DashPage
      title="Who reached out."
      quiet={`${leads.length} ${leads.length === 1 ? "inquiry" : "inquiries"} from your website.`}
      label="Inquiries"
    >
      <ul className={styles.list} aria-label="Inquiries">
        {leads.map((lead) => (
          <li key={lead.id}>
            <XaInitial name={lead.name} shape="round" size={30} />
            <div className={styles.listText}>
              <span className={styles.listTitle}>{lead.name}</span>
              {lead.message ? <p className={styles.listBody}>{lead.message}</p> : null}
              <span className={styles.listDetail}>
                {lead.source ? `${sourceLabel(lead.source)} · ` : ""}
                {lead.email ? lead.email : phoneIn(lead.message) ? "Left a phone number, no email" : "No email or phone left"}
              </span>
            </div>
            <div className={styles.listEnd}>
              <time dateTime={lead.createdAt}>{formatWhen(lead.createdAt)}</time>
              {lead.email ? <XaTextLink href={`mailto:${lead.email}`}>Reply</XaTextLink>
                : phoneIn(lead.message) ? <XaTextLink href={`tel:${phoneIn(lead.message)!.replace(/[^\d+]/g, "")}`}>Call {phoneIn(lead.message)}</XaTextLink> : null}
            </div>
          </li>
        ))}
      </ul>
    </DashPage>
  );
}
