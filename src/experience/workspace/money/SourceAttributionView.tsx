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
          Back
        </XaTextLink>
      </p>
      <div className={styles.brief}>
        <XaInitial name={creator.creatorName} size={48} />
        <XaHeadline
          quiet={
            ownSource
              ? "Every business that adds it keeps your name on it."
              : "Your copy is yours to run. Their name stays on it."
          }
        >
          Made by {creator.creatorName}.
        </XaHeadline>
      </div>
      <XaAnswers
        labelWidth={140}
        rows={[
          [
            "Your copy",
            "Its own records, its own connections, and your say over what goes live.",
          ],
          [
            "The credit",
            `${creator.creatorName} is named as its maker for as long as it runs.`,
          ],
          [
            "Money",
            "The credit alone costs nothing. A price shows here only once one is agreed.",
          ],
        ]}
      />
      {ownSource ? (
        <nav aria-label="Your source" className={styles.links}>
          <XaTextLink
            href={`/workspace?${new URLSearchParams({ workspaceId, agencyView: "library" })}`}
          >
            Open the Library
          </XaTextLink>
          {process.env.STRELVA_REVENUE_SPLITS === "1" ? (
            <>
              <span aria-hidden="true">·</span>
              <XaTextLink
                href={`/workspace/creator-maintenance?${new URLSearchParams({ workspaceId })}`}
              >
                Apps you made for others
              </XaTextLink>
            </>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
