/**
 * Internal API Routes
 * Per Hydex Spec Section 5.6.3.4 and 5.6.4.4
 * 
 * These endpoints are called by trusted internal services:
 * - Enclave (for attestations)
 * - MPC nodes (for withdrawal finalization)
 */

import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { updateDeposit, getDeposit } from "./deposits.js";
import { updateBurn, getBurn } from "./burns.js";
import type { EnclaveAttestation, AttestationInput } from "../types.js";

export const internalRouter = Router();

// Simple API key auth for internal endpoints
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
 * POST /v1/internal/attestations
 * Submit a deposit attestation from the enclave
 * 
 * This triggers the Arcium-encrypted mint flow on Solana.
 */
internalRouter.post("/attestations", requireInternalAuth, async (req, res) => {
  const attestation = req.body as EnclaveAttestation;

  // Validate required fields
  const required = [
    "deposit_id",
    "note_commitment",
    "amount",
    "recipient_solana",
    "block_height",
    "enclave_signature",
    "enclave_pubkey",
  ];

  for (const field of required) {
    if (!(field in attestation)) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: `Missing required field: ${field}`,
        },
      });
    }
  }

  console.log(`[Attestation] Received for deposit #${attestation.deposit_id}`);
  console.log(`  Amount: ${attestation.amount}`);
  console.log(`  Block: ${attestation.block_height}`);
  console.log(`  Recipient: ${attestation.recipient_solana}`);

  // Check deposit exists
  const deposit = getDeposit(attestation.deposit_id);
  if (!deposit) {
    return res.status(404).json({
      error: {
        code: "DEPOSIT_NOT_FOUND",
        message: `Deposit ${attestation.deposit_id} not found`,
      },
    });
  }

  // Verify deposit is in correct state
  if (deposit.status !== "AddressGenerated" && deposit.status !== "Detected") {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: `Deposit in invalid state: ${deposit.status}`,
      },
    });
  }

  try {
    // Convert attestation to internal format
    const attestationInput: AttestationInput = {
      note_commitment: hexToBytes(attestation.note_commitment),
      amount: BigInt(attestation.amount),
      recipient_solana: new PublicKey(attestation.recipient_solana).toBytes(),
      block_height: BigInt(attestation.block_height),
      enclave_signature: hexToBytes(attestation.enclave_signature),
      enclave_pubkey: hexToBytes(attestation.enclave_pubkey),
    };

    // TODO: In production:
    // 1. Initialize SolanaBridgeClient
    // 2. Call submitAttestation with Arcium encryption
    // 3. Wait for confirmation
    // 4. Update deposit status

    // For now, mark as detected
    updateDeposit(attestation.deposit_id, {
      status: "Detected",
      note_commitment: attestation.note_commitment,
      detected_block_height: attestation.block_height,
      amount: attestation.amount,
    });

    console.log(`  [OK] Attestation processed, deposit marked as Detected`);

    // Simulate successful submission
    const mockTxid = "sim_" + Date.now().toString(36);

    res.json({
      deposit_id: attestation.deposit_id,
      status: "Detected",
      solana_txid: mockTxid,
      message: "Attestation received. Mint pending Arcium verification.",
    });
  } catch (error) {
    console.error(`  [ERROR] Failed to process attestation:`, error);

    updateDeposit(attestation.deposit_id, {
      status: "Failed",
      failure_reason: (error as Error).message,
    });

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to process attestation",
        details: { error: (error as Error).message },
      },
    });
  }
});

/**
 * POST /v1/internal/burn-intents/:id/finalize
 * Finalize a withdrawal after Zcash TX is mined
 * 
 * Called by MPC coordinator.
 */
internalRouter.post("/burn-intents/:id/finalize", requireInternalAuth, async (req, res) => {
  const burnId = parseInt(req.params.id);
  const { zcash_txid, new_status, failure_reason } = req.body;

  if (isNaN(burnId)) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid burn ID",
      },
    });
  }

  if (!zcash_txid || !new_status) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Missing required fields: zcash_txid, new_status",
      },
    });
  }

  const burn = getBurn(burnId);
  if (!burn) {
    return res.status(404).json({
      error: {
        code: "BURN_NOT_FOUND",
        message: `Burn intent ${burnId} not found`,
      },
    });
  }

  // Verify burn is in correct state
  if (burn.status !== "Processing") {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: `Burn intent in invalid state: ${burn.status}`,
      },
    });
  }

  console.log(`[Finalize] Burn #${burnId} with Zcash TX: ${zcash_txid}`);

  try {
    // TODO: In production:
    // 1. Call Solana program's finalize_withdrawal with Arcium
    // 2. Update burn intent on-chain
    // 3. Wait for confirmation

    // Update local state
    updateBurn(burnId, {
      status: new_status as any,
      zcash_txid,
      failure_reason: failure_reason || null,
    });

    console.log(`  [OK] Burn #${burnId} finalized as ${new_status}`);

    res.json({
      burn_id: burnId,
      status: new_status,
      zcash_txid,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`  [ERROR] Failed to finalize burn:`, error);

    updateBurn(burnId, {
      status: "Failed",
      failure_reason: (error as Error).message,
    });

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to finalize withdrawal",
        details: { error: (error as Error).message },
      },
    });
  }
});

/**
 * GET /v1/internal/deposits
 * List all deposits (internal monitoring)
 */
internalRouter.get("/deposits", requireInternalAuth, async (_req, res) => {
  // Import deposits map from deposits route
  const { getAllDeposits } = await import("./deposits.js");
  const deposits = getAllDeposits();

  res.json({
    count: deposits.length,
    items: deposits,
  });
});

/**
 * POST /v1/internal/deposits
 * Create a test deposit (internal/testing)
 */
internalRouter.post("/deposits", requireInternalAuth, async (req, res) => {
  const { solana_recipient, network } = req.body;

  if (!solana_recipient) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Missing solana_recipient",
      },
    });
  }

  const { createDepositInternal } = await import("./deposits.js");
  const deposit = createDepositInternal("internal-test", solana_recipient, network || "testnet");

  console.log(`[Internal] Created test deposit #${deposit.deposit_id}`);
  res.status(201).json(deposit);
});

/**
 * POST /v1/internal/deposits/:id/set-ua
 * Set unified address for a deposit (simulating enclave)
 */
internalRouter.post("/deposits/:id/set-ua", requireInternalAuth, async (req, res) => {
  const depositId = parseInt(req.params.id);
  const { unified_address } = req.body;

  if (isNaN(depositId)) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid deposit ID",
      },
    });
  }

  if (!unified_address) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Missing unified_address",
      },
    });
  }

  const deposit = getDeposit(depositId);
  if (!deposit) {
    return res.status(404).json({
      error: {
        code: "DEPOSIT_NOT_FOUND",
        message: `Deposit ${depositId} not found`,
      },
    });
  }

  updateDeposit(depositId, {
    unified_address,
    ua_length: unified_address.length,
    status: "AddressGenerated",
  });

  console.log(`[Internal] Set UA for deposit #${depositId}`);
  res.json({
    deposit_id: depositId,
    status: "AddressGenerated",
    unified_address,
  });
});

/**
 * GET /v1/internal/burns
 * List all burns (internal monitoring)
 */
internalRouter.get("/burns", requireInternalAuth, async (_req, res) => {
  // Import burns map from burns route
  const { getAllBurns } = await import("./burns.js");
  const burns = getAllBurns();

  res.json({
    count: burns.length,
    items: burns,
  });
});

/**
 * GET /v1/internal/burns/:id/address
 * Get the encrypted Zcash address for a burn intent (MPC nodes only)
 * 
 * This is the critical endpoint that allows MPC nodes to know where to send ZEC.
 */
internalRouter.get("/burns/:id/address", requireInternalAuth, async (req, res) => {
  const burnId = parseInt(req.params.id);

  if (isNaN(burnId)) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid burn ID",
      },
    });
  }

  const { getBurn } = await import("./burns.js");
  const burn = getBurn(burnId);

  if (!burn) {
    return res.status(404).json({
      error: {
        code: "BURN_NOT_FOUND",
        message: `Burn intent ${burnId} not found`,
      },
    });
  }

  // Only allow fetching address for pending/processing burns
  if (burn.status !== "Pending" && burn.status !== "Processing") {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: `Burn intent ${burnId} is already ${burn.status}`,
      },
    });
  }

  // Decrypt the address (base64 decode for now - Arcium in production)
  const zcash_address = Buffer.from(burn.zcash_address_encrypted, "base64").toString("utf8");

  console.log(`[Internal] MPC fetched address for burn #${burnId}`);

  res.json({
    burn_id: burn.burn_id,
    user: burn.user,
    amount: burn.amount,
    zcash_address,
    zcash_address_hash: burn.zcash_address_hash,
    status: burn.status,
    network: burn.network,
  });
});

/**
 * GET /v1/internal/burns/pending
 * List all pending burns for MPC processing
 */
internalRouter.get("/burns/pending", requireInternalAuth, async (_req, res) => {
  const { getAllBurns } = await import("./burns.js");
  const burns = getAllBurns();

  const pending = burns.filter(b => b.status === "Pending" || b.status === "Processing");

  res.json({
    count: pending.length,
    items: pending.map(b => ({
      burn_id: b.burn_id,
      user: b.user,
      amount: b.amount,
      zcash_address_hash: b.zcash_address_hash,
      status: b.status,
      network: b.network,
      created_at: b.created_at,
    })),
  });
});

/**
 * Helper: Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

