/**
 * Solana Bridge Client
 *
 * Handles all interactions with the wzec_bridge Solana program.
 * Uses Arcium encryption for privacy-preserving submissions.
 *
 * Per Hydex Spec Section 5.4
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import type { AttestationInput } from "../types.js";
type WzecBridgeIdl = any;
export declare class SolanaBridgeClient {
    private connection;
    private program;
    private payer;
    private programId;
    private arcium;
    private bridgeConfigPda;
    private mintAuthorityPda;
    private szecMintPda;
    constructor(rpcUrl: string, programId: string, keypairPath: string, idl: WzecBridgeIdl);
    /**
     * Initialize the client (fetch MXE key, etc.)
     */
    initialize(): Promise<void>;
    /**
     * Create a deposit intent on Solana
     * Returns the deposit_id from the bridge config
     */
    createDepositIntent(user: PublicKey): Promise<number>;
    /**
     * Set unified address for a deposit (called by enclave)
     */
    setUnifiedAddress(depositId: number, user: PublicKey, uaHash: Uint8Array, amount: anchor.BN, noteCommitment: Uint8Array, enclaveAuthority: Keypair): Promise<string>;
    /**
     * Submit attestation for minting (PRIVACY-PRESERVING)
     *
     * The attestation is encrypted via Arcium before submission.
     * Solana never sees the plaintext attestation details.
     */
    submitAttestation(attestation: AttestationInput, depositId: number, user: PublicKey): Promise<{
        signature: string;
        success: boolean;
    }>;
    /**
     * Create burn intent for withdrawal (PRIVACY-PRESERVING)
     *
     * The Zcash address is hashed before submission.
     * Solana stores the hash, MPC nodes receive the actual address off-chain.
     */
    createBurnIntent(user: PublicKey, amount: anchor.BN, zcashAddress: string): Promise<{
        burnId: number;
        signature: string;
    }>;
    /**
     * Finalize withdrawal after Zcash TX is mined
     * Called by MPC authority after successful Zcash transaction
     */
    finalizeWithdrawal(burnId: number, user: PublicKey, zcashTxid: Uint8Array, mpcAuthority: Keypair, success?: boolean): Promise<string>;
    /**
     * Check if a note commitment has been claimed
     */
    isNoteClaimed(noteCommitment: Uint8Array): Promise<boolean>;
    /**
     * Get deposit intent state
     */
    getDepositIntent(depositId: number, user: PublicKey): Promise<any>;
    /**
     * Get bridge config
     */
    getBridgeConfig(): Promise<any>;
    get payerPublicKey(): PublicKey;
}
export {};
