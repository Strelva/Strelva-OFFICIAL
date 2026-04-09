/**
 * Rewards domain types — isolated from src/lib/types.ts on purpose.
 *
 * Mirrors /Users/laneyfraass/GLDF/src/lib/rewards/types.ts so that a member
 * shape returned by the GLDF proxy slots into KV storage without translation.
 * Keep these aligned when GLDF evolves.
 */

export type Tier = "snapper" | "super-snapper";

export interface Badge {
  slug: string;
  name: string;
  earnedAt: string;
}

export interface Member {
  email: string;
  starsAvailable: number;
  starsLifetime: number;
  tier: Tier;
  tierOverride: Tier | null;
  displayName: string | null;
  birthday: string | null; // MM-DD
  favoriteFruit: string | null;
  badges: Badge[];
  subscriptionBonusClaimed: boolean;
  createdAt: string;
}

export type TransactionType = "earn" | "redeem" | "admin-credit" | "admin-debit";

export interface StarsTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  reason: string;
  timestamp: string;
}

export interface RewardsConfig {
  starsPerBag: number;
  starsToRedeem: number;
  redemptionValue: number; // dollars off
  newsletterBonus: number;
  subscriptionBonus: number;
  tierThresholdSuper: number;
}

export const DEFAULT_REWARDS_CONFIG: RewardsConfig = {
  starsPerBag: 100,
  starsToRedeem: 100,
  redemptionValue: 5,
  newsletterBonus: 50,
  subscriptionBonus: 30,
  tierThresholdSuper: 500,
};
