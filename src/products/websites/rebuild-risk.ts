/** Conservative review policy, not a model prediction or calibrated score. */
export function isHighRiskWebsiteClaim(text: string): boolean {
  return /(?:\b\d{4}\b|\b\d+\s*(?:million|billion|percent|%)|[$£€]\s*\d|\b(?:years?|decades?|dollars?|fees?|prices?|rates?|free|guarantee[ds]?|certified|licensed|licen[cs]e|accredited|award|winning|win rate|settlement|verdict|cure|board.certified|bar|admission|admitted|attorney|lawyer|doctor|medical|degree|graduate[ds]?|law school|J\.?D\.?|LL\.?M\.?|Ph\.?D\.?|CPA|results?|outcomes?)\b)/i.test(text);
}
