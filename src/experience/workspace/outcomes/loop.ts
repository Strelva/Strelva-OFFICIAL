/**
 * The week's outcome loop: found → asked → answered → booked → earned.
 *
 * A stage whose value is `null` has no source yet and renders "Not measured
 * yet", never zero. "Found" is the only estimated stage. Currency stages do
 * not size the ribbon; they continue the thickness of the stage before them.
 */

export type LoopStageKey = "found" | "asked" | "answered" | "booked" | "earned";

export interface LoopStage {
  key: LoopStageKey;
  /** Owner words under the numeral: "found you", "asked". */
  label: string;
  /** Where it came from: "Google, Maps, AI answers". */
  detail?: string;
  /** Null when Strelva has no source for this stage yet. */
  value: number | null;
  kind: "count" | "currency";
  /** True for modelled numbers (only "found" today). */
  estimated?: boolean;
  /** Link to the receipts behind the number, when one exists. */
  receiptHref?: string;
}

export interface LoopRibbonSegment {
  key: LoopStageKey;
  x0: number;
  x1: number;
  thickness: number;
  measured: boolean;
}

export interface LoopRibbonGeometry {
  width: number;
  height: number;
  /** Closed SVG path of the whole ribbon. Empty when nothing is measured. */
  path: string;
  segments: LoopRibbonSegment[];
}

export interface LoopGeometryOptions {
  width?: number;
  height?: number;
  /** Thinnest a measured stage may draw, in viewBox units. */
  minThickness?: number;
  /** Horizontal run of each taper between stages. */
  taper?: number;
  /** Compression exponent; < 1 keeps small stages visible next to large ones. */
  exponent?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Pure ribbon geometry. Stages are laid out in equal columns; each measured
 * count sets the thickness of its column as (value / largest)^exponent of the
 * full height, floored at `minThickness`. Unmeasured and currency stages carry
 * the previous thickness forward. Between columns the edge tapers over
 * `taper` units. The ribbon is centred vertically.
 */
export function loopRibbonGeometry(stages: readonly LoopStage[], options: LoopGeometryOptions = {}): LoopRibbonGeometry {
  const width = options.width ?? 1000;
  const height = options.height ?? 160;
  const minThickness = options.minThickness ?? 8;
  const exponent = options.exponent ?? 0.35;
  const columns = Math.max(1, stages.length);
  const column = width / columns;
  const taper = Math.min(options.taper ?? 30, column / 2);
  const counts = stages.filter(stage => stage.kind === "count" && stage.value !== null && stage.value > 0).map(stage => stage.value as number);
  const largest = counts.length ? Math.max(...counts) : 0;
  const empty: LoopRibbonGeometry = { width, height, path: "", segments: [] };
  if (!stages.length || !stages.some(stage => stage.value !== null)) return empty;

  // Thickness before any measured count: the first measured count's, else the floor.
  const firstCount = stages.find(stage => stage.kind === "count" && stage.value !== null);
  let carried = firstCount && largest > 0 ? Math.max(minThickness, height * Math.pow((firstCount.value as number) / largest, exponent)) : minThickness;
  const segments = stages.map((stage, index) => {
    if (stage.kind === "count" && stage.value !== null) {
      carried = largest > 0 && stage.value > 0 ? Math.max(minThickness, height * Math.pow(stage.value / largest, exponent)) : minThickness;
    }
    return { key: stage.key, x0: round(index * column), x1: round((index + 1) * column), thickness: round(Math.min(height, carried)), measured: stage.value !== null };
  });

  const centre = height / 2;
  const edge = (thickness: number) => centre - thickness / 2;
  const top: [number, number][] = [];
  segments.forEach((segment, index) => {
    const previous = segments[index - 1];
    if (!previous) top.push([0, edge(segment.thickness)]);
    else {
      top.push([segment.x0, edge(previous.thickness)]);
      top.push([segment.x0 + taper, edge(segment.thickness)]);
    }
    if (index === segments.length - 1) top.push([width, edge(segment.thickness)]);
  });
  const upper = top.map(([x, y]) => [round(x), round(y)] as [number, number]);
  const lower = upper.map(([x, y]) => [x, round(2 * centre - y)] as [number, number]).reverse();
  const points = [...upper, ...lower];
  const path = `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
  return { width, height, path, segments };
}

const stage = (stages: readonly LoopStage[], key: LoopStageKey) => stages.find(item => item.key === key);
const known = (value: LoopStage | undefined): value is LoopStage & { value: number } => value !== undefined && value.value !== null;

/** The verdict headline, from measured stages only. */
export function loopHeadline(stages: readonly LoopStage[]): string {
  const found = stage(stages, "found");
  const booked = stage(stages, "booked");
  const people = (count: number) => count === 1 ? "1 person found you." : `${count.toLocaleString("en-US")} people found you.`;
  if (known(found) && known(booked)) return `${people(found.value)} ${booked.value} became ${booked.value === 1 ? "a booking" : "bookings"}.`;
  if (known(found)) return people(found.value);
  if (known(booked)) return `${booked.value} ${booked.value === 1 ? "booking" : "bookings"} this week.`;
  return "This week isn't measured yet.";
}

export interface LoopChip {
  key: "answer-rate" | "per-booking";
  /** The stage the chip sits on. */
  stage: LoopStageKey;
  text: string;
}

/** Ratio chips on the ribbon. Each appears only when both of its numbers are measured. */
export function loopChips(stages: readonly LoopStage[]): LoopChip[] {
  const chips: LoopChip[] = [];
  const asked = stage(stages, "asked");
  const answered = stage(stages, "answered");
  const booked = stage(stages, "booked");
  const earned = stage(stages, "earned");
  if (known(asked) && known(answered) && asked.value > 0) {
    chips.push({ key: "answer-rate", stage: "answered", text: `${Math.round((Math.min(answered.value, asked.value) / asked.value) * 100)}% answered` });
  }
  if (known(booked) && known(earned) && booked.value > 0) {
    chips.push({ key: "per-booking", stage: "earned", text: `$${Math.round(earned.value / booked.value).toLocaleString("en-US")} per booking` });
  }
  return chips;
}
