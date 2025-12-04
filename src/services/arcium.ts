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
import {
    getMXEPublicKey,
    getMXEAccAddress,
    getCompDefAccAddress,
    getCompDefAccOffset,
    getArciumAccountBaseSeed,
    getArciumProgAddress,
    getMempoolAccAddress,
    getExecutingPoolAccAddress,
    getComputationAccAddress,
    getArciumEnv,
    RescueCipher,
    x25519,
    compressUint128,
} from "@arcium-hq/client";
import { randomBytes } from "crypto";
import type { AttestationInput } from "../types.js";

export class ArciumPrivacyService {
    private connection: Connection;
    private programId: PublicKey;
    private provider: anchor.AnchorProvider;
    private mxePublicKey: Uint8Array | null = null;

    constructor(
        connection: Connection,
        programId: PublicKey,
        provider: anchor.AnchorProvider
    ) {
        this.connection = connection;
        this.programId = programId;
        this.provider = provider;
    }

    /**
     * Initialize by fetching MXE public key
     */
    async initialize(): Promise<void> {
        console.log("Initializing Arcium privacy service...");
        this.mxePublicKey = await this.getMXEPublicKeyWithRetry();
        console.log("  MXE public key loaded:", Buffer.from(this.mxePublicKey).toString("hex").slice(0, 32) + "...");
    }

    /**
     * Get MXE public key with retry logic
     */
    private async getMXEPublicKeyWithRetry(
        maxRetries = 10,
        retryDelay = 1000
    ): Promise<Uint8Array> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const key = await getMXEPublicKey(this.provider, this.programId);
                if (key) return key;
            } catch (error) {
                console.log(`  Attempt ${attempt}/${maxRetries} to get MXE key...`);
            }
            await new Promise((r) => setTimeout(r, retryDelay));
        }
        throw new Error("Failed to get MXE public key");
    }

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
    } {
        if (!this.mxePublicKey) {
            throw new Error("Arcium service not initialized");
        }

        // Generate ephemeral x25519 keypair for this encryption
        const privateKey = x25519.utils.randomSecretKey();
        const publicKey = x25519.getPublicKey(privateKey);

        // Derive shared secret with MXE
        const sharedSecret = x25519.getSharedSecret(privateKey, this.mxePublicKey);

        // Create cipher
        const cipher = new RescueCipher(sharedSecret);

        // Generate random nonce
        const nonceBytes = randomBytes(16);
        const nonce = BigInt("0x" + nonceBytes.toString("hex"));

        // Serialize attestation to bytes
        const attestationBytes = this.serializeAttestation(attestation);

        // Encrypt in 32-byte chunks (Arcium format)
        const encryptedChunks: Uint8Array[] = [];
        for (let i = 0; i < attestationBytes.length; i += 32) {
            const chunk = attestationBytes.slice(i, Math.min(i + 32, attestationBytes.length));
            const padded = new Uint8Array(32);
            padded.set(chunk);

            // Compress to 128-bit values for Rescue cipher (returns bigint[])
            const compressed = compressUint128(padded);
            // cipher.encrypt returns number[][] - array of encrypted chunks
            const encrypted = cipher.encrypt(compressed, nonceBytes);

            // Each encrypted chunk is a number[] that we convert to Uint8Array
            const encChunk = new Uint8Array(encrypted[0]);
            encryptedChunks.push(encChunk);
        }

        return { encryptedChunks, publicKey, nonce };
    }

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
    } {
        if (!this.mxePublicKey) {
            throw new Error("Arcium service not initialized");
        }

        // Generate ephemeral x25519 keypair
        const privateKey = x25519.utils.randomSecretKey();
        const publicKey = x25519.getPublicKey(privateKey);

        // Derive shared secret
        const sharedSecret = x25519.getSharedSecret(privateKey, this.mxePublicKey);

        // Create cipher
        const cipher = new RescueCipher(sharedSecret);

        // Generate nonce
        const nonceBytes = randomBytes(16);
        const nonce = BigInt("0x" + nonceBytes.toString("hex"));

        // Hash the address (we store hash, not address, for privacy)
        const addressBytes = Buffer.from(zcashAddress, "utf8");
        const hashInput = new Uint8Array(32);
        // Simple hash: first 32 bytes of address or padded
        hashInput.set(addressBytes.slice(0, 32));

        // Encrypt the hash
        const compressed = compressUint128(hashInput);
        // cipher.encrypt returns number[][] - array of encrypted chunks
        const encrypted = cipher.encrypt(compressed, nonceBytes);

        // First encrypted chunk as Uint8Array
        const encryptedHash = new Uint8Array(encrypted[0]);

        return { encryptedHash, publicKey, nonce };
    }

    /**
     * Get all required Arcium accounts for a computation
     */
    getArciumAccounts(
        computationOffset: anchor.BN,
        instructionName: string
    ): {
        mxeAccount: PublicKey;
        mempoolAccount: PublicKey;
        executingPool: PublicKey;
        computationAccount: PublicKey;
        compDefAccount: PublicKey;
        clusterAccount: PublicKey;
        arciumProgram: PublicKey;
    } {
        const arciumEnv = getArciumEnv();
        const offset = getCompDefAccOffset(instructionName);

        return {
            mxeAccount: getMXEAccAddress(this.programId),
            mempoolAccount: getMempoolAccAddress(this.programId),
            executingPool: getExecutingPoolAccAddress(this.programId),
            computationAccount: getComputationAccAddress(this.programId, computationOffset),
            compDefAccount: getCompDefAccAddress(
                this.programId,
                Buffer.from(offset).readUInt32LE()
            ),
            clusterAccount: arciumEnv.arciumClusterPubkey,
            arciumProgram: getArciumProgAddress(),
        };
    }

    /**
     * Serialize attestation to bytes for encryption
     */
    private serializeAttestation(attestation: AttestationInput): Uint8Array {
        // Total: 32 + 8 + 32 + 8 + 64 + 32 = 176 bytes
        const buffer = new Uint8Array(176);
        let offset = 0;

        // note_commitment: [u8; 32]
        buffer.set(attestation.note_commitment, offset);
        offset += 32;

        // amount: u64
        const amountBytes = this.bigintToBytes(attestation.amount, 8);
        buffer.set(amountBytes, offset);
        offset += 8;

        // recipient_solana: [u8; 32]
        buffer.set(attestation.recipient_solana, offset);
        offset += 32;

        // block_height: u64
        const heightBytes = this.bigintToBytes(attestation.block_height, 8);
        buffer.set(heightBytes, offset);
        offset += 8;

        // enclave_signature: [u8; 64]
        buffer.set(attestation.enclave_signature, offset);
        offset += 64;

        // enclave_pubkey: [u8; 32]
        buffer.set(attestation.enclave_pubkey, offset);

        return buffer;
    }

    /**
     * Convert bigint to little-endian bytes
     */
    private bigintToBytes(value: bigint, length: number): Uint8Array {
        const bytes = new Uint8Array(length);
        let remaining = value;
        for (let i = 0; i < length; i++) {
            bytes[i] = Number(remaining & BigInt(0xff));
            remaining = remaining >> BigInt(8);
        }
        return bytes;
    }
}

