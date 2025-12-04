/**
 * Deposit Intent Routes
 * Per Hydex Spec Section 5.6.3
 */
import type { DepositIntent } from "../types.js";
export declare const depositRouter: import("express-serve-static-core").Router;
/**
 * Update deposit status (internal use)
 */
export declare function updateDeposit(depositId: number, updates: Partial<DepositIntent>): boolean;
export declare function getDeposit(depositId: number): DepositIntent | undefined;
export declare function getAllDeposits(): DepositIntent[];
/**
 * Create a deposit internally (for testing/internal use)
 */
export declare function createDepositInternal(userId: string, solanaRecipient: string, network?: "mainnet" | "testnet"): DepositIntent;
