/**
 * Currency Conversion System
 *
 * This module handles currency conversions between different in-game currencies.
 * Currently supports gold-to-points conversion at a 1:10 ratio.
 */

/**
 * Gold to Points Conversion Ratio
 * 1 point = 10 gold
 */
const GOLD_TO_POINTS_RATIO = 10;

/**
 * Convert gold to points using the established ratio.
 * Uses floor division - fractional conversions are truncated.
 *
 * @param goldAmount - The amount of gold to convert
 * @returns The number of points received (floored)
 * @throws Error if goldAmount is negative
 *
 * @example
 * convertGoldToPoints(10) // returns 1
 * convertGoldToPoints(25) // returns 2
 * convertGoldToPoints(9)  // returns 0
 */
export function convertGoldToPoints(goldAmount: number): number {
  if (goldAmount < 0) {
    throw new Error("Gold amount cannot be negative");
  }
  return Math.floor(goldAmount / GOLD_TO_POINTS_RATIO);
}

/**
 * Get the gold-to-points conversion ratio
 * @returns The ratio as a number (e.g., 10 means 10 gold = 1 point)
 */
export function getGoldToPointsRatio(): number {
  return GOLD_TO_POINTS_RATIO;
}
