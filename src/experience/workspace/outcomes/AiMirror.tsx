"use client";

import { useId, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { Sparkle } from "lucide-react";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { staggerDelay, strelvaMotion } from "@/lib/motion";
import { aiMirrorHeadline, aiMirrorMatrix, splitAnswer, type AiMirrorData } from "./ai-mirror";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

const STATE_LABEL = { mentioned: "Mentioned", wrong_info_fixed: "Had wrong info, fixed" } as const;

/**
 * What does AI say when people ask for a business like mine? A real answer
 * with the business name highlighted and its citations, then a queries ×
 * assistants matrix. Only probed assistants get a column; only positive
 * states are drawn (see ai-mirror.ts for the rails).
 */
export function AiMirror({ data, className }: { data: AiMirrorData; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const matrix = useMemo(() => aiMirrorMatrix(data.assistants, data.rows), [data.assistants, data.rows]);
  const parts = data.answer ? splitAnswer(data.answer.text, data.businessName) : null;
  const shown = entrance.started || entrance.snap;
  const pop = (delay: number) => ({
    initial: entrance.snap ? false as const : { opacity: 0, scale: 0.4 },
    animate: shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 },
    transition: entranceTransition(entrance, strelvaMotion.gooey, delay),
  });

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, styles.mirror, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="ai-mirror">
      <Reveal as="header">
        <p className={styles.eyebrow}>{data.eyebrow}</p>
        <h2 id={titleId} className={styles.headline}>{aiMirrorHeadline(data)}</h2>
        {data.summary ? <p className={styles.lede}>{data.summary}</p> : null}
      </Reveal>

      {data.answer ? <Reveal className={styles.answer} delay={0.08}>
        <p className={styles.answerQuery}><span className={styles.answerMark}><Sparkle size={14} aria-hidden="true" /></span><span>“{data.answer.query}”</span></p>
        <p className={styles.answerText}>
          {parts ? <>
            {parts.before}
            <mark className={styles.highlight}>
              {/* Draw role: the highlight sweeps in behind the name, 360–720 ms. */}
              <motion.span aria-hidden="true" className={styles.highlightFill}
                initial={entrance.snap ? false : { scaleX: 0 }}
                animate={{ scaleX: shown ? 1 : 0 }}
                transition={entranceTransition(entrance, { ...strelvaMotion.draw, duration: 0.36 }, 0.36)} />
              <span>{parts.match}</span>
            </mark>
            {data.answer.citations.length ? <span className={styles.citeRef} aria-label="source 1">1</span> : null}
            {parts.after}
          </> : data.answer.text}
        </p>
        {data.answer.citations.length ? <ul className={styles.citations} aria-label="Sources this answer cited">
          {data.answer.citations.map((citation, index) => <Reveal as="li" key={`${citation.label}-${index}`} index={index} delay={0.72} y={4}>
            {citation.href ? <a className={styles.citation} href={citation.href} target="_blank" rel="noreferrer"><span>{index + 1}</span>{citation.label}</a>
              : <span className={styles.citation}><span>{index + 1}</span>{citation.label}</span>}
          </Reveal>)}
        </ul> : null}
      </Reveal> : null}

      {matrix.rows.length && matrix.assistants.length ? <>
        <table className={styles.matrix}>
          <caption className="sr-only">Searches where AI answers named {data.businessName}, by assistant</caption>
          <thead><tr><th scope="col">What people asked</th>{matrix.assistants.map(assistant => <th key={assistant.id} scope="col">{assistant.label}</th>)}</tr></thead>
          <tbody>
            {matrix.rows.map((row, rowIndex) => <Reveal as="tr" key={row.query} index={rowIndex} delay={0.4}>
              <th scope="row">{row.query}</th>
              {matrix.assistants.map((assistant, column) => {
                const state = row.cells[assistant.id];
                return <td key={assistant.id}>{state ? <motion.span className={styles.dot} data-state={state} role="img" aria-label={STATE_LABEL[state]}
                  {...pop(0.4 + staggerDelay(rowIndex) + column * 0.03)} /> : null}</td>;
              })}
            </Reveal>)}
          </tbody>
        </table>
        <ul className={styles.legend} aria-label="Key">
          <li><span className={styles.dot} data-state="mentioned" aria-hidden="true" />mentioned</li>
          {matrix.hasFixed ? <li><span className={styles.dot} data-state="wrong_info_fixed" aria-hidden="true" />wrong info · fixed</li> : null}
          {data.checkedAt ? <li>Checked {new Date(data.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</li> : null}
        </ul>
      </> : <div className={styles.empty}>
        <strong>{data.total > 0 ? "No answer named you yet." : "Strelva hasn't checked AI answers yet."}</strong>
        <span>{data.total > 0 ? "Strelva keeps asking each week. Searches show up here the first time an answer names you." : "Once the weekly check runs, the searches where AI names you show up here."}</span>
      </div>}
    </section>
  </EntranceProvider>;
}
