/**
 * Authentication Routes
 * Per Hydex Spec Section 5.6.2
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { v4 as uuidv4 } from "uuid";
import type { AuthChallenge, AuthSession } from "../types.js";

export const authRouter = Router();

// In-memory challenge store (use Redis in production)
const challenges = new Map<string, { challenge: string; expiresAt: Date }>();

const JWT_SECRET = process.env.JWT_SECRET || "hydex-dev-secret";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /v1/auth/challenge
 * Request a login challenge for wallet signature
 */
authRouter.post("/challenge", async (req, res) => {
    const { solana_pubkey } = req.body;

    if (!solana_pubkey) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "solana_pubkey is required",
            },
        });
    }

    // Validate pubkey format
    try {
        bs58.decode(solana_pubkey);
    } catch {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Invalid Solana public key format",
            },
        });
    }

    // Generate challenge
    const nonce = uuidv4();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const challenge = `Hydex Bridge - Login Request\nWallet: ${solana_pubkey}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;

    // Store challenge
    challenges.set(nonce, { challenge, expiresAt });

    // Cleanup old challenges
    setTimeout(() => challenges.delete(nonce), CHALLENGE_TTL_MS);

    const response: AuthChallenge = {
        challenge,
        nonce,
        expires_at: expiresAt.toISOString(),
    };

    res.json(response);
});

/**
 * POST /v1/auth/verify-wallet
 * Verify wallet signature and issue access token
 */
authRouter.post("/verify-wallet", async (req, res) => {
    const { solana_pubkey, signed_message, nonce, message } = req.body;

    // Validate required fields
    if (!solana_pubkey || !signed_message || !nonce || !message) {
        return res.status(400).json({
            error: {
                code: "INVALID_REQUEST",
                message: "Missing required fields: solana_pubkey, signed_message, nonce, message",
            },
        });
    }

    // Check challenge exists and not expired
    const storedChallenge = challenges.get(nonce);
    if (!storedChallenge) {
        return res.status(401).json({
            error: {
                code: "ERR_NONCE_MISMATCH",
                message: "Challenge not found or already used",
            },
        });
    }

    if (new Date() > storedChallenge.expiresAt) {
        challenges.delete(nonce);
        return res.status(401).json({
            error: {
                code: "ERR_CHALLENGE_EXPIRED",
                message: "Challenge has expired",
            },
        });
    }

    // Verify message matches
    if (message !== storedChallenge.challenge) {
        return res.status(401).json({
            error: {
                code: "ERR_INVALID_SIGNATURE",
                message: "Message does not match challenge",
            },
        });
    }

    // Verify signature
    try {
        const publicKeyBytes = bs58.decode(solana_pubkey);
        const signatureBytes = Buffer.from(signed_message, "base64");

        // Solana wallets sign with a specific prefix format
        // The format is: "\x19Solana Signed Message:\n" + message_length + message
        const messageBytes = Buffer.from(message, "utf8");
        const prefix = Buffer.from(`\x19Solana Signed Message:\n${messageBytes.length}`);
        const fullMessage = Buffer.concat([prefix, messageBytes]);

        const isValid = nacl.sign.detached.verify(
            fullMessage,
            signatureBytes,
            publicKeyBytes
        );

        if (!isValid) {
            // Try without prefix (for wallets that don't use it)
            const isValidRaw = nacl.sign.detached.verify(
                messageBytes,
                signatureBytes,
                publicKeyBytes
            );

            if (!isValidRaw) {
                return res.status(401).json({
                    error: {
                        code: "ERR_INVALID_SIGNATURE",
                        message: "Signature verification failed",
                    },
                });
            }
        }
    } catch (error) {
        return res.status(401).json({
            error: {
                code: "ERR_INVALID_SIGNATURE",
                message: "Failed to verify signature",
            },
        });
    }
    // Remove used challenge
    challenges.delete(nonce);

    // Generate user_id (deterministic from pubkey)
    const user_id = solana_pubkey;

    // Issue JWT
    const access_token = jwt.sign(
        {
            user_id,
            solana_pubkey,
            iat: Math.floor(Date.now() / 1000),
        },
        JWT_SECRET,
        { expiresIn: "24h" }
    );

    const response: AuthSession = {
        user_id,
        solana_pubkey,
        authenticated: true,
        access_token,
        created: false, // Would check database in production
    };

    res.json(response);
});

/**
 * Middleware to verify JWT token
 */
export function requireAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Missing or invalid authorization header",
            },
        });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = {
            user_id: decoded.user_id,
            solana_pubkey: decoded.solana_pubkey,
        };
        next();
    } catch (error) {
        return res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Invalid or expired token",
            },
        });
    }
}

