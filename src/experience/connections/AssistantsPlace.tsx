import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { XaHeadline, XaSays } from "@/components/ui/strelva/Xa";
import { BusinessSelect } from "./BusinessSelect";
import { Clay } from "./Clay";
import { CopyButton } from "./CopyButton";
import styles from "./xa-connections.module.css";

export interface AssistantBusinessChoice { workspaceId: string; name: string }

/** Breaks the address only after a "/" so a phone never splits a word. */
function slashBreaks(value: string) {
  const parts = value.split("/");
  return parts.map((part, index) => <Fragment key={index}>{part}{index < parts.length - 1 ? <>/<wbr /></> : null}</Fragment>);
}

/**
 * Assistants (Business details · Connections). One headline, then the one
 * object: Pebble on the felt handing over Strelva's address, with the steps
 * in Claude's own menu words. Codex setup sits behind its own disclosure.
 * The connected list is passed in so the route keeps its data loading and
 * the preview can supply fixtures.
 */
export function AssistantsPlace({ choices, selected, resourceUrl, basePath = "/connect", children }: {
  choices: readonly AssistantBusinessChoice[] | null; selected?: AssistantBusinessChoice; resourceUrl: string; basePath?: string; children?: ReactNode;
}) {
  const name = selected?.name ?? "your business";
  return <div className={styles.place} data-single>
    <div className={styles.main}>
      <nav className={styles.crumb} aria-label="Breadcrumb"><Link href="/workspace?view=settings">Business details</Link><span aria-hidden="true">/</span><span aria-current="page">Assistants</span></nav>
      <XaHeadline quiet="Website changes still come to you for a yes.">Claude can work with {name}.</XaHeadline>
      {choices && (choices.length > 1 || (!selected && choices.length > 0)) ? <BusinessSelect choices={choices} selectedId={selected?.workspaceId} basePath={basePath} /> : null}

      <section className={`${styles.object} ${styles.felted}`} aria-labelledby="assistant-connect-heading">
        <div className={styles.objectText}>
          <h2 id="assistant-connect-heading" className={styles.objectLabel}>Strelva’s address for Claude</h2>
          <div className={styles.key}><span className={styles.keyValue}>{slashBreaks(resourceUrl)}</span><CopyButton value={resourceUrl} label="Strelva’s address for Claude" /></div>
          <ol className={styles.steps}>
            <li className={styles.step}><span>In Claude, open Settings, then Connectors. Choose Add, name it Strelva and paste this address.</span></li>
            <li className={styles.step}><span>Claude asks you to sign in. Choose {name} and read what it asks to do. Nothing connects until you say so.</span></li>
            <li className={styles.step}><span>Ask it something about your business, like “What does my website say about Saturday hours?”</span></li>
          </ol>
          <details className={styles.disclosure}>
            <summary>For Codex <ChevronDown className={styles.chevron} size={16} aria-hidden="true" /></summary>
            <p className={`${styles.quiet} ${styles.disclosureBody}`}>In Codex, add Strelva as an MCP server over HTTP with the address above, then sign in when Codex asks. It can pick up website changes for a coding agent; it can&apos;t make anything live.</p>
          </details>
        </div>
        <Clay pose="alone" width={280} label="Pebble handing over Strelva’s address" />
      </section>

      {choices === null ? <div role="alert"><XaSays>Your business access couldn’t be loaded. Reload to try again.</XaSays></div>
        : choices.length === 0 ? <XaSays>You need direct owner access to a business to manage its assistant connections.</XaSays>
          : !selected ? <div role="alert"><XaSays>That business isn’t available to your account. Choose one above.</XaSays></div>
            : children}
    </div>
  </div>;
}
