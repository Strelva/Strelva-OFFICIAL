import Link from "next/link";
import type { ReactNode } from "react";
import { XaHeadline, XaSays } from "@/components/ui/strelva/Xa";
import { CopyButton } from "./CopyButton";
import styles from "./xa-connections.module.css";

export interface AssistantBusinessChoice { workspaceId: string; name: string }

/**
 * Assistants (Business details · Connections). Composed like XA · R4: what
 * this is for in one headline, the one address an assistant needs, then the
 * assistants already connected. The connected list is passed in so the route
 * keeps its own data loading and the preview can supply fixtures.
 */
export function AssistantsPlace({ choices, selected, resourceUrl, basePath = "/connect", children }: {
  choices: readonly AssistantBusinessChoice[] | null; selected?: AssistantBusinessChoice; resourceUrl: string; basePath?: string; children?: ReactNode;
}) {
  const name = selected?.name ?? "your business";
  return <div className={styles.place} data-single>
    <div className={styles.main}>
      <nav className={styles.crumb} aria-label="Breadcrumb"><Link href="/workspace?view=settings">Business details</Link><span aria-hidden="true">/</span><span aria-current="page">Assistants</span></nav>
      <XaHeadline quiet="Website changes still come to you for a yes.">Claude and Codex can work with {name}.</XaHeadline>

      {choices && choices.length > 1 ? <nav className={styles.actions} aria-label="Choose business">
        <span className={styles.small}>Business</span>
        {choices.map(choice => <Link key={choice.workspaceId} href={`${basePath}?workspaceId=${choice.workspaceId}`} aria-current={selected?.workspaceId === choice.workspaceId ? "page" : undefined} className={styles.textButton} data-current={selected?.workspaceId === choice.workspaceId || undefined}>{choice.name}</Link>)}
      </nav> : null}

      <section className={styles.section} aria-labelledby="assistant-connect-heading">
        <h2 id="assistant-connect-heading" className={styles.sectionTitle}>Connect an assistant</h2>
        <ul className={styles.group}>
          <li className={styles.groupRow}>
            <span className={styles.groupText}><span className={styles.groupDetail}>Strelva’s address for assistants</span><span className={styles.addressValue} data-size="md">{resourceUrl}</span></span>
            <span className={styles.groupEnd}><CopyButton value={resourceUrl} label="Strelva’s address for assistants" /></span>
          </li>
        </ul>
        <ol className={styles.steps}>
          <li className={styles.step}><span>In Claude, add a custom connector named Strelva with this address. In Codex, add it as an HTTP MCP server and sign in.</span></li>
          <li className={styles.step}><span>Choose {name} and read what the assistant asks to do. Nothing connects until you say so.</span></li>
          <li className={styles.step}><span>Ask it: “Read my business context and show me the websites I can work on.”</span></li>
        </ol>
      </section>

      {choices === null ? <div role="alert"><XaSays>Your business access couldn’t be loaded. Reload to try again.</XaSays></div>
        : choices.length === 0 ? <XaSays>You need direct owner access to a business to manage its assistant connections.</XaSays>
          : !selected ? <div role="alert"><XaSays>That business isn’t available to your account. Choose a business above.</XaSays></div>
            : children}
    </div>
  </div>;
}
