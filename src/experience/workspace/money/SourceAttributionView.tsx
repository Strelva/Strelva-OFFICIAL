import {
  XaAnswers,
  XaHeadline,
  XaInitial,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import { systemHref } from "@/experience/systems/model";
import styles from "./money.module.css";

/** "Made by <creator>": the lineage of one System, and what that credit does and does not mean for money. */
export function SourceAttributionView({
  workspaceId,
  systemId,
  creator,
}: {
  workspaceId: string;
  systemId: string;
  creator: { creatorName: string; creatorWorkspaceId: string };
}) {
  const ownSource = workspaceId === creator.creatorWorkspaceId;
  return (
    <div className={styles.screen}>
      <p className={styles.note}>
        <XaTextLink href={systemHref("", workspaceId, systemId)}>
          Back to the System
        </XaTextLink>
      </p>
      <div className={styles.brief}>
        <XaInitial name={creator.creatorName} size={48} />
        <XaHeadline
          quiet={
            ownSource
              ? "Every business that installs it keeps your name on it."
              : "Your Version is yours. The credit stays with them."
          }
        >
          Made by {creator.creatorName}.
        </XaHeadline>
      </div>
      <XaAnswers
        labelWidth={140}
        rows={[
          [
            "Your Version",
            "Its own records, Connections and decisions about what goes live.",
          ],
          [
            "The credit",
            `${creator.creatorName} is named as the creator for as long as this System runs.`,
          ],
          [
            "Money",
            "Usage, royalties and upkeep show only when written terms are recorded. A credit alone sets none.",
          ],
        ]}
      />
      {ownSource ? (
        <nav aria-label="Your source" className={styles.links}>
          <XaTextLink
            href={`/workspace?${new URLSearchParams({ workspaceId, agencyView: "library" })}`}
          >
            Open Library sources
          </XaTextLink>
          {process.env.STRELVA_REVENUE_SPLITS === "1" ? (
            <>
              <span aria-hidden="true">·</span>
              <XaTextLink
                href={`/workspace/creator-maintenance?${new URLSearchParams({ workspaceId })}`}
              >
                Listing and upkeep terms
              </XaTextLink>
            </>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
