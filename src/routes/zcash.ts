/**
 * Zcash Scanning Routes
 * Per Hydex Spec Section 5.6.5
 */

import { Router } from "express";

export const zcashRouter = Router();

// Simple API key auth for scanning endpoints
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "hydex-internal-key";

function requireInternalAuth(req: any, res: any, next: any) {
    const apiKey = req.headers["x-api-key"];

    if (apiKey !== INTERNAL_API_KEY) {
        return res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Invalid internal API key",
            },
        });
    }

    next();
}

/**
 * POST /v1/zec/emit_orchard
 * Trigger a manual Orchard block scan
 * 
 * This endpoint is primarily for recovery/debugging.
 * Normal operation uses continuous scanning in the enclave.
 */
zcashRouter.post("/emit_orchard", requireInternalAuth, async (req, res) => {
    const { start_height, end_height, network } = req.body;

    // Validate required fields
    if (start_height === undefined || end_height === undefined || !network) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Missing required fields: start_height, end_height, network",
            },
        });
    }

    if (start_height > end_height) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "start_height must be <= end_height",
            },
        });
    }

    if (end_height - start_height > 10000) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Range too large (max 10000 blocks)",
            },
        });
    }

    console.log(`[Zcash] Manual scan requested: ${start_height} - ${end_height} (${network})`);

    try {
        // TODO: In production:
        // 1. Call enclave API to trigger scan
        // 2. Wait for completion
        // 3. Return detected notes

        // For now, return mock response
        res.json({
            started: true,
            start_height,
            end_height,
            detected_notes: [], // Would be populated by actual scan
            message: "Scan queued. Check /v1/internal/attestations for results.",
        });
    } catch (error) {
        console.error(`[Zcash] Scan error:`, error);

        res.status(500).json({
            error: {
                code: "CHAIN_UNAVAILABLE",
                message: "Failed to trigger Zcash scan",
                details: { error: (error as Error).message },
            },
        });
    }
});

