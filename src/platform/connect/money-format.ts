/** Stripe charge minor units; ISK and UGX keep Stripe's backwards-compatible
 * two-decimal representation even though customer display has zero decimals. */
const zeroDecimal=new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","vnd","vuv","xaf","xof","xpf"]);
export function chargeUnits(currency:string){return zeroDecimal.has(currency.toLowerCase())?1:100;}
export function formatMoney(amount:number,currency:string){return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(amount/chargeUnits(currency));}
