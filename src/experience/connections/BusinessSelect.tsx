"use client";

import { useRouter } from "next/navigation";
import styles from "./xa-connections.module.css";

/** "For Harbor Dental": a labeled native select that opens the same page for another business. */
export function BusinessSelect({ choices, selectedId, basePath }: { choices: readonly { workspaceId: string; name: string }[]; selectedId?: string; basePath: string }) {
  const router = useRouter();
  return <label className={styles.inlineField}>
    <span>For</span>
    <select className={styles.inlineSelect} value={selectedId ?? ""} onChange={event => router.push(`${basePath}?${new URLSearchParams({ workspaceId: event.target.value })}`)}>
      {selectedId ? null : <option value="" disabled>Choose a business</option>}
      {choices.map(choice => <option key={choice.workspaceId} value={choice.workspaceId}>{choice.name}</option>)}
    </select>
  </label>;
}
