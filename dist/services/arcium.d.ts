/**
 * Arcium Privacy Service
 *
 * Handles all encryption for Solana submissions.
 * Ensures sensitive data (attestations, Zcash addresses) never appears
 * in plaintext on the Solana blockchain.
 *
 * Per Hydex Spec Section 5.2
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import type { AttestationInput } from "../types.js";
export declare class ArciumPrivacyService {
    private connection;
    private programId;
    private provider;
    private mxePublicKey;
    constructor(connection: Connection, programId: PublicKey, provider: anchor.AnchorProvider);
    /**
     * Initialize by fetching MXE public key
     */
    initialize(): Promise<void>;
    /**
     * Get MXE public key with retry logic
     */
    private getMXEPublicKeyWithRetry;
    /**
     * Encrypt attestation input for verify_attestation instruction
     *
     * Privacy guarantee: Attestation details (note_commitment, amount, etc.)
     * are encrypted and only decryptable by Arcium MPC nodes.
     */
    encryptAttestation(attestation: AttestationInput): {
        encryptedChunks: Uint8Array[];
        publicKey: Uint8Array;
        nonce: bigint;
    };
    /**
     * Encrypt Zcash address for burn intent
     *
     * Privacy guarantee: The Zcash destination address never appears
     * on the Solana blockchain in plaintext.
     */
    encryptZcashAddress(zcashAddress: string): {
        encryptedHash: Uint8Array;
        publicKey: Uint8Array;
        nonce: bigint;
    };
    /**
     * Get all required Arcium accounts for a computation
     */
    getArciumAccounts(computationOffset: anchor.BN, instructionName: string): {
        mxeAccount: PublicKey;
        mempoolAccount: PublicKey;
        executingPool: PublicKey;
        computationAccount: PublicKey;
        compDefAccount: PublicKey;
        clusterAccount: PublicKey;
        arciumProgram: PublicKey;
    };
    /**
     * Serialize attestation to bytes for encryption
     */
    private serializeAttestation;
    /**
     * Convert bigint to little-endian bytes
     */
    private bigintToBytes;
}
