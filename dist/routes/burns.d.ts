/**
 * Burn Intent Routes (Withdrawals)
 * Per Hydex Spec Section 5.6.4
 */
import type { BurnIntent } from "../types.js";
export declare const burnRouter: import("express-serve-static-core").Router;
/**
 * Update burn status (internal use)
 */
export declare function updateBurn(burnId: number, updates: Partial<BurnIntent>): boolean;
export declare function getBurn(burnId: number): BurnIntent | undefined;
export declare function getAllBurns(): BurnIntent[];
