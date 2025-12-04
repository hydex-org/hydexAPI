/**
 * Burn Intent Routes (Withdrawals)
 * Per Hydex Spec Section 5.6.4
 */

import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { requireAuth } from "./auth.js";
import type { BurnIntent, CreateBurnRequest } from "../types.js";

export const burnRouter = Router();

// In-memory store (use database in production)
const burns = new Map<number, BurnIntent>();
const idempotencyKeys = new Map<string, number>();
let nextBurnId = 1;

/**
 * POST /v1/burn-intents
 * Create a new burn/withdrawal intent
 * 
 * Privacy: The zcash_address is NEVER stored in plaintext.
 * We only store a hash for internal tracking.
 */
burnRouter.post("/", requireAuth, async (req: any, res) => {
    const body = req.body as CreateBurnRequest;
    const { idempotency_key, user, amount, zcash_address, network } = body;

    // Validate required fields
    if (!idempotency_key || !user || !amount || !zcash_address || !network) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Missing required fields: idempotency_key, user, amount, zcash_address, network",
            },
        });
    }

    // Check idempotency
    if (idempotencyKeys.has(idempotency_key)) {
        const existingId = idempotencyKeys.get(idempotency_key)!;
        const existing = burns.get(existingId);
        if (existing) {
            return res.json(existing);
        }
    }

    // Validate Solana pubkey
    try {
        new PublicKey(user);
    } catch {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid Solana user address",
            },
        });
    }

    // Validate Zcash address format
    if (!zcash_address.startsWith("u") && !zcash_address.startsWith("zs")) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid Zcash address format (expected unified address starting with 'u' or shielded address starting with 'zs')",
            },
        });
    }

    // PRIVACY: Hash the Zcash address - never store plaintext
    const zcash_address_hash = createHash("sha256")
        .update(zcash_address)
        .digest("hex");

    // Create burn intent
    const burn_id = nextBurnId++;
    const now = new Date().toISOString();

    const burn: BurnIntent = {
        burn_id,
        user_id: req.user.user_id,
        user,
        amount,
        zcash_address_hash, // Only the hash, not the actual address
        status: "Pending",
        solana_burn_txid: null,
        zcash_txid: null,
        failure_reason: null,
        network,
        created_at: now,
        updated_at: now,
    };

    // Store
    burns.set(burn_id, burn);
    idempotencyKeys.set(idempotency_key, burn_id);

    console.log(`[Burn] Created burn intent #${burn_id} for ${amount} sZEC`);
    console.log(`  User: ${user}`);
    console.log(`  Zcash addr hash: ${zcash_address_hash.slice(0, 16)}...`);

    // TODO: In production:
    // 1. Call Solana program with encrypted burn intent via Arcium
    // 2. User signs the burn transaction
    // 3. Update status accordingly

    res.status(201).json({
        burn_id,
        user,
        amount,
        zcash_address: zcash_address.slice(0, 8) + "...", // Only show prefix for UX
        status: burn.status,
        solana_burn_txid: burn.solana_burn_txid,
        network,
        created_at: burn.created_at,
    });
});

/**
 * GET /v1/burn-intents/:id
 * Get a specific burn intent
 */
burnRouter.get("/:id", requireAuth, async (req: any, res) => {
    const burnId = parseInt(req.params.id);

    if (isNaN(burnId)) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid burn ID",
            },
        });
    }

    const burn = burns.get(burnId);

    if (!burn) {
        return res.status(404).json({
            error: {
                code: "BURN_NOT_FOUND",
                message: `Burn intent ${burnId} not found`,
            },
        });
    }

    // Check ownership
    if (burn.user_id !== req.user.user_id) {
        return res.status(403).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Access denied",
            },
        });
    }

    res.json({
        burn_id: burn.burn_id,
        user: burn.user,
        amount: burn.amount,
        zcash_address: "[encrypted]", // Never expose
        status: burn.status,
        solana_burn_txid: burn.solana_burn_txid,
        zcash_txid: burn.zcash_txid,
        failure_reason: burn.failure_reason,
        created_at: burn.created_at,
        updated_at: burn.updated_at,
    });
});

/**
 * GET /v1/burn-intents
 * List burn intents for authenticated user
 */
burnRouter.get("/", requireAuth, async (req: any, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    // Filter by user
    const userBurns = Array.from(burns.values())
        .filter((b) => b.user_id === req.user.user_id)
        .sort((a, b) => b.burn_id - a.burn_id);

    // Apply cursor pagination
    let startIndex = 0;
    if (cursor) {
        const cursorId = parseInt(cursor);
        startIndex = userBurns.findIndex((b) => b.burn_id < cursorId);
        if (startIndex === -1) startIndex = userBurns.length;
    }

    const items = userBurns.slice(startIndex, startIndex + limit);
    const nextCursor = items.length === limit ? items[items.length - 1].burn_id.toString() : null;

    res.json({
        items: items.map((b) => ({
            burn_id: b.burn_id,
            status: b.status,
            amount: b.amount,
            zcash_txid: b.zcash_txid,
            created_at: b.created_at,
        })),
        next_cursor: nextCursor,
    });
});

/**
 * Update burn status (internal use)
 */
export function updateBurn(burnId: number, updates: Partial<BurnIntent>): boolean {
    const burn = burns.get(burnId);
    if (!burn) return false;

    Object.assign(burn, updates, { updated_at: new Date().toISOString() });
    return true;
}

export function getBurn(burnId: number): BurnIntent | undefined {
    return burns.get(burnId);
}

export function getAllBurns(): BurnIntent[] {
    return Array.from(burns.values()).map((b) => ({
        ...b,
        zcash_address_encrypted: "[encrypted]", // Never expose plaintext
    }));
}
