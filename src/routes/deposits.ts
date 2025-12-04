/**
 * Deposit Intent Routes
 * Per Hydex Spec Section 5.6.3
 */

import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { requireAuth } from "./auth.js";
import type { DepositIntent, CreateDepositRequest } from "../types.js";

export const depositRouter = Router();

// In-memory store (use database in production)
const deposits = new Map<number, DepositIntent>();
const idempotencyKeys = new Map<string, number>();
let nextDepositId = 1;

/**
 * POST /v1/deposit-intents
 * Create a new deposit intent
 */
depositRouter.post("/", requireAuth, async (req: any, res) => {
    const body = req.body as CreateDepositRequest;
    const { idempotency_key, solana_recipient, expected_amount, memo, network } = body;

    // Validate required fields
    if (!idempotency_key || !solana_recipient || !network) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Missing required fields: idempotency_key, solana_recipient, network",
            },
        });
    }

    // Check idempotency
    if (idempotencyKeys.has(idempotency_key)) {
        const existingId = idempotencyKeys.get(idempotency_key)!;
        const existing = deposits.get(existingId);
        if (existing) {
            return res.json(existing);
        }
    }

    // Validate Solana pubkey
    try {
        new PublicKey(solana_recipient);
    } catch {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid Solana recipient address",
            },
        });
    }

    // Create deposit intent
    const deposit_id = nextDepositId++;
    const now = new Date().toISOString();

    const deposit: DepositIntent = {
        deposit_id,
        user_id: req.user.user_id,
        solana_recipient,
        unified_address: null, // Set by enclave later
        ua_length: 0,
        note_commitment: null,
        detected_block_height: null,
        amount: expected_amount || null,
        status: "Pending",
        failure_reason: null,
        network,
        created_at: now,
        updated_at: now,
    };

    // Store
    deposits.set(deposit_id, deposit);
    idempotencyKeys.set(idempotency_key, deposit_id);

    // TODO: In production:
    // 1. Call enclave to generate UA
    // 2. Call Solana program to create deposit intent PDA
    // 3. Update deposit with UA

    console.log(`[Deposit] Created deposit intent #${deposit_id} for ${solana_recipient}`);

    res.status(201).json(deposit);
});

/**
 * GET /v1/deposit-intents/:id
 * Get a specific deposit intent
 */
depositRouter.get("/:id", requireAuth, async (req: any, res) => {
    const depositId = parseInt(req.params.id);

    if (isNaN(depositId)) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid deposit ID",
            },
        });
    }

    const deposit = deposits.get(depositId);

    if (!deposit) {
        return res.status(404).json({
            error: {
                code: "DEPOSIT_NOT_FOUND",
                message: `Deposit ${depositId} not found`,
            },
        });
    }

    // Check ownership
    if (deposit.user_id !== req.user.user_id) {
        return res.status(403).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Access denied",
            },
        });
    }

    res.json(deposit);
});

/**
 * GET /v1/deposit-intents
 * List deposit intents for authenticated user
 */
depositRouter.get("/", requireAuth, async (req: any, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    // Filter by user
    const userDeposits = Array.from(deposits.values())
        .filter((d) => d.user_id === req.user.user_id)
        .sort((a, b) => b.deposit_id - a.deposit_id);

    // Apply cursor pagination
    let startIndex = 0;
    if (cursor) {
        const cursorId = parseInt(cursor);
        startIndex = userDeposits.findIndex((d) => d.deposit_id < cursorId);
        if (startIndex === -1) startIndex = userDeposits.length;
    }

    const items = userDeposits.slice(startIndex, startIndex + limit);
    const nextCursor = items.length === limit ? items[items.length - 1].deposit_id.toString() : null;

    res.json({
        items: items.map((d) => ({
            deposit_id: d.deposit_id,
            status: d.status,
            amount: d.amount,
            created_at: d.created_at,
        })),
        next_cursor: nextCursor,
    });
});

/**
 * Update deposit status (internal use)
 */
export function updateDeposit(depositId: number, updates: Partial<DepositIntent>): boolean {
    const deposit = deposits.get(depositId);
    if (!deposit) return false;

    Object.assign(deposit, updates, { updated_at: new Date().toISOString() });
    return true;
}

export function getDeposit(depositId: number): DepositIntent | undefined {
    return deposits.get(depositId);
}

export function getAllDeposits(): DepositIntent[] {
    return Array.from(deposits.values());
}

/**
 * Create a deposit internally (for testing/internal use)
 */
export function createDepositInternal(
    userId: string,
    solanaRecipient: string,
    network: "mainnet" | "testnet" = "testnet"
): DepositIntent {
    const deposit_id = nextDepositId++;
    const now = new Date().toISOString();

    const deposit: DepositIntent = {
        deposit_id,
        user_id: userId,
        solana_recipient: solanaRecipient,
        unified_address: null,
        ua_length: 0,
        note_commitment: null,
        detected_block_height: null,
        amount: null,
        status: "Pending",
        failure_reason: null,
        network,
        created_at: now,
        updated_at: now,
    };

    deposits.set(deposit_id, deposit);
    return deposit;
}

