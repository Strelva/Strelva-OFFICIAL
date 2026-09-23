import styles from "./orbit-score.module.css";

export interface OrbitScoreProps {
  /** Measured score from 0 to 100. Callers must not pass an unmeasured value. */
  score: number;
  grade: string;
  size?: number;
  label?: string;
}

/**
 * Strelva's score mark: the grade at the centre of an orbit whose arc is the
 * measured score. The quarter guides come from the brand's orbital lines.
 */
export function OrbitScore({ score, grade, size = 160, label }: OrbitScoreProps) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const angle = (value / 100) * 2 * Math.PI - Math.PI / 2;
  const dot = { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  return <figure className={styles.orbit} style={{ width: size, height: size }} role="img" aria-label={label || `Grade ${grade}, ${value} out of 100`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle className={styles.guide} cx="50" cy="50" r="49" />
      <circle className={styles.track} cx="50" cy="50" r={radius} />
      {[0, 90, 180, 270].map(turn => <line key={turn} className={styles.tick} x1="50" y1="3" x2="50" y2="8" transform={`rotate(${turn} 50 50)`} />)}
      <circle className={styles.arc} cx="50" cy="50" r={radius} strokeDasharray={`${(value / 100) * circumference} ${circumference}`} style={{ ["--orbit-length" as string]: `${circumference}` }} transform="rotate(-90 50 50)" />
      {value > 0 ? <circle className={styles.body} cx={dot.x} cy={dot.y} r="2.6" /> : null}
    </svg>
    <span className={styles.grade}>{grade}</span>
  </figure>;
}
