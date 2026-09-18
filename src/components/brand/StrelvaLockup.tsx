import type { CSSProperties } from "react";
import { letteringPath } from "./lettering-morph";
import styles from "./StrelvaLockup.module.css";

/** Reference-derived display lettering with the original cairn. Not a font family.
 * Static by default. Remount with a new React key to replay an opted-in entrance.
 * Inherit color; set --lockup-accent to override the sage pebble.
 */
export function StrelvaLockup({ animated = false, paused = false, compare = false, className = "" }: {
  animated?: boolean;
  paused?: boolean;
  compare?: boolean;
  className?: string;
}) {
  return <svg viewBox="0 0 1011 213" role="img" aria-label="Strelva" className={`${styles.lockup} ${className}`} data-strelva-lockup data-compare={compare} data-animated={animated} data-paused={paused}>
<g transform="translate(0 3) scale(4.2)"><g className={styles.stone} style={{ "--order": 0 } as CSSProperties}><ellipse cx="24" cy="38.5" rx="12.2" ry="5.6" transform="rotate(-3 24 38.5)"/></g><g className={styles.stone} style={{ "--order": 1 } as CSSProperties}><ellipse cx="22.5" cy="26.4" rx="9.4" ry="4.9" transform="rotate(5 22.5 26.4)"/></g><g className={styles.stone} style={{ "--order": 2 } as CSSProperties}><ellipse cx="20.5" cy="15.9" rx="6.6" ry="4" transform="rotate(-8 20.5 15.9)"/></g><g className={styles.stone} style={{ "--order": 3 } as CSSProperties}><circle cx="24.5" cy="7.2" r="3.4" fill="var(--lockup-accent, #a8b69c)"/></g></g>{compare ? <g>{Array.from({ length: 7 }, (_, index) => <path key={index} data-morph-letter={index} fillRule="evenodd" d={letteringPath(index, 0)} />)}</g> : <g className={styles.newLetters}><g transform="translate(56 -528)"><g className={styles.letter} style={{ "--order": 0 } as CSSProperties}><path d="M326 560C307 546 284 537 259 537C220 537 194 561 194 591C194 620 218 632 252 645C282 657 299 667 299 686C299 705 281 717 258 717C230 717 210 699 193 673L178 685C188 715 220 732 255 732C301 732 333 709 333 675C333 646 310 632 274 618C241 605 215 596 215 576C215 558 233 546 252 546C271 546 290 563 308 584Z"/></g><g className={styles.letter} style={{ "--order": 1 } as CSSProperties}><path d="M362 598V582C364 572 376 561 391 556V598H423V609H391V692C391 710 400 718 425 713V724C414 729 404 732 393 732C372 732 362 719 362 697V609H340V598Z"/></g><g className={styles.letter} style={{ "--order": 2 } as CSSProperties}><path d="M451 594H479V620C492 594 511 587 529 594L523 622C505 610 490 612 479 634V728H451Z"/></g><g className={styles.letter} style={{ "--order": 3 } as CSSProperties}><path fillRule="evenodd" d="M557 658C558 691 576 712 603 712C622 712 637 700 649 681L653 684C643 715 622 733 594 733C554 733 529 705 529 663C529 621 556 592 593 592C623 592 641 610 650 634ZM556 650L621 628C615 610 606 600 592 600C572 600 558 619 556 650Z"/></g><g className={styles.letter} style={{ "--order": 4 } as CSSProperties}><path d="M670 537H694V728H670Z"/></g><g className={styles.letter} style={{ "--order": 5 } as CSSProperties}><path d="M714 594H744L782 696L817 594H827L779 731H768Z"/></g><g className={styles.letter} style={{ "--order": 6 } as CSSProperties}><path fillRule="evenodd" d="M848 606C866 596 882 592 899 592C929 592 942 607 942 635V729H916V707C902 724 889 732 872 732C846 732 831 716 831 695C831 670 849 657 879 648L916 636V629C916 610 909 600 895 600C880 600 862 612 845 627ZM916 646L890 656C869 664 858 676 858 692C858 706 867 714 881 714C895 714 906 706 916 695Z"/></g></g></g>}
  </svg>;
}
