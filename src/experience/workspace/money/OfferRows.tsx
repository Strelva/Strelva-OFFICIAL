"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { XaTextLink } from "@/components/ui/strelva/Xa";
import xa from "./money.module.css";

export interface MoneyOffer {
  key: string;
  /** The price as one sentence: "North Studio website care: $150 for November." */
  sentence: ReactNode;
  detail?: ReactNode;
}

/**
 * Prices waiting for a yes, one sentence each (October 16): the current one
 * holds the one XaYes beside it; the others wait their turn behind "Answer
 * this one". No select, no form: the owner decides on the sentence itself.
 */
export function OfferRows({
  offers,
  current,
  onChoose,
  yes,
  locked = false,
  label,
}: {
  offers: readonly MoneyOffer[];
  current: string | null;
  onChoose: (key: string) => void;
  yes: ReactNode;
  locked?: boolean;
  label: string;
}) {
  return (
    <ul className={xa.offers} aria-label={label}>
      {offers.map((offer) => (
        <li key={offer.key} className={xa.offer}>
          <p className={xa.offerSentence}>{offer.sentence}</p>
          {offer.detail ? <p className={xa.note}>{offer.detail}</p> : null}
          {offer.key === current ? (
            <div className={xa.offerYes}>{yes}</div>
          ) : !locked ? (
            <p className={xa.links}>
              <XaTextLink onClick={() => onChoose(offer.key)}>
                Answer this one
              </XaTextLink>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type Turn = { active: string | null; take: (id: string) => void; report: (id: string, waiting: boolean, holding: boolean) => void };
const YesTurn = createContext<Turn | null>(null);

/**
 * One yes per screen across several price lists (money terms shows the
 * business's prices and its app prices). The first list with something
 * waiting holds the yes; "Answer this one" in another list hands it over,
 * except while a yes is inside its Undo window.
 */
export function MoneyYesTurns({ order, children }: { order: readonly string[]; children: ReactNode }) {
  const [lists, setLists] = useState<Readonly<Record<string, { waiting: boolean; holding: boolean }>>>({});
  const [taken, setTaken] = useState<string | null>(null);
  const report = useCallback((id: string, waiting: boolean, holding: boolean) => {
    setLists((current) =>
      current[id]?.waiting === waiting && current[id]?.holding === holding
        ? current
        : { ...current, [id]: { waiting, holding } },
    );
  }, []);
  const active = taken && lists[taken]?.waiting ? taken : (order.find((id) => lists[id]?.waiting) ?? null);
  const holding = active ? Boolean(lists[active]?.holding) : false;
  const value = useMemo(
    () => ({ active, take: (id: string) => { if (!holding) setTaken(id); }, report }),
    [active, holding, report],
  );
  return <YesTurn.Provider value={value}>{children}</YesTurn.Provider>;
}

/** Whether this list holds the screen's one yes. Outside MoneyYesTurns it always does. */
export function useYesTurn(id: string, waiting: boolean, holding = false) {
  const turn = useContext(YesTurn);
  const report = turn?.report;
  useEffect(() => {
    report?.(id, waiting, holding);
  }, [report, id, waiting, holding]);
  return {
    mine: !turn || turn.active === id,
    take: () => turn?.take(id),
  };
}
