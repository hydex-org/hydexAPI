/**
 * Solana Bridge Client
 * 
 * Handles all interactions with the wzec_bridge Solana program.
 * Uses Arcium encryption for privacy-preserving submissions.
 * 
 * Per Hydex Spec Section 5.4
 */

import * as anchor from "@coral-xyz/anchor";
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { readFileSync } from "fs";
import { ArciumPrivacyService } from "./arcium.js";
import type { AttestationInput, DepositIntent, BurnIntent } from "../types.js";

// Use any for IDL type since we load it dynamically
type WzecBridgeIdl = any;

export class SolanaBridgeClient {
    private connection: Connection;
    private program: anchor.Program;
    private payer: Keypair;
    private programId: PublicKey;
    private arcium: ArciumPrivacyService;

    // PDAs
    private bridgeConfigPda: PublicKey;
    private mintAuthorityPda: PublicKey;
    private szecMintPda: PublicKey;

    constructor(
        rpcUrl: string,
        programId: string,
        keypairPath: string,
        idl: WzecBridgeIdl
    ) {
        this.connection = new Connection(rpcUrl, "confirmed");
        this.programId = new PublicKey(programId);

        // Load payer keypair
        const keypairData = JSON.parse(readFileSync(keypairPath, "utf8"));
        this.payer = Keypair.fromSecretKey(new Uint8Array(keypairData));

        // Setup Anchor provider
        const wallet = new anchor.Wallet(this.payer);
        const provider = new anchor.AnchorProvider(this.connection, wallet, {
            commitment: "confirmed",
        });

        // Setup program
        this.program = new anchor.Program(idl, provider);

        // Initialize Arcium service
        this.arcium = new ArciumPrivacyService(
            this.connection,
            this.programId,
            provider
        );

        // Derive PDAs
        [this.bridgeConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("bridge-config")],
            this.programId
        );

        [this.mintAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint-authority")],
            this.programId
        );

        [this.szecMintPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("szec-mint")],
            this.programId
        );
    }

    /**
     * Initialize the client (fetch MXE key, etc.)
     */
    async initialize(): Promise<void> {
        console.log("Initializing Solana bridge client...");
        console.log("  Program ID:", this.programId.toString());
        console.log("  Payer:", this.payer.publicKey.toString());

        await this.arcium.initialize();
        console.log("  Solana client ready");
    }

    /**
     * Create a deposit intent on Solana
     * Returns the deposit_id from the bridge config
     */
    async createDepositIntent(user: PublicKey): Promise<number> {
        // Get current deposit nonce
        const config = await (this.program.account as any).bridgeConfig.fetch(this.bridgeConfigPda);
        const depositId = config.depositNonce.toNumber();

        // Derive deposit intent PDA
        const [depositIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("deposit-intent"),
                user.toBuffer(),
                new anchor.BN(depositId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        // Create deposit intent
        await this.program.methods
            .initDepositIntent()
            .accountsPartial({
                user,
                bridgeConfig: this.bridgeConfigPda,
                depositIntent: depositIntentPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.payer])
            .rpc({ commitment: "confirmed" });

        return depositId;
    }

    /**
     * Set unified address for a deposit (called by enclave)
     */
    async setUnifiedAddress(
        depositId: number,
        user: PublicKey,
        uaHash: Uint8Array,
        amount: anchor.BN,
        noteCommitment: Uint8Array,
        enclaveAuthority: Keypair
    ): Promise<string> {
        const [depositIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("deposit-intent"),
                user.toBuffer(),
                new anchor.BN(depositId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        const tx = await this.program.methods
            .setUnifiedAddress(
                Array.from(uaHash) as any,
                amount,
                Array.from(noteCommitment) as any
            )
            .accountsPartial({
                authority: enclaveAuthority.publicKey,
                bridgeConfig: this.bridgeConfigPda,
                depositIntent: depositIntentPda,
            })
            .signers([enclaveAuthority])
            .rpc({ commitment: "confirmed" });

        return tx;
    }

    /**
     * Submit attestation for minting (PRIVACY-PRESERVING)
     * 
     * The attestation is encrypted via Arcium before submission.
     * Solana never sees the plaintext attestation details.
     */
    async submitAttestation(
        attestation: AttestationInput,
        depositId: number,
        user: PublicKey
    ): Promise<{ signature: string; success: boolean }> {
        console.log("Submitting encrypted attestation...");

        // Encrypt attestation via Arcium
        const { encryptedChunks, publicKey, nonce } =
            this.arcium.encryptAttestation(attestation);

        // Convert to format expected by program
        const encryptedAttestationVec = encryptedChunks.map(
            (chunk) => Array.from(chunk) as [number, ...number[]] & { length: 32 }
        );

        // Generate computation offset
        const computationOffset = new anchor.BN(Date.now());

        // Get Arcium accounts
        const arciumAccounts = this.arcium.getArciumAccounts(
            computationOffset,
            "verify_attestation"
        );

        // Derive PDAs
        const [depositIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("deposit-intent"),
                user.toBuffer(),
                new anchor.BN(depositId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        const [signPdaAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("sign")], // SIGN_PDA_SEED
            this.programId
        );

        try {
            const signature = await this.program.methods
                .mintWithAttestation(
                    computationOffset,
                    encryptedAttestationVec,
                    Array.from(publicKey) as any,
                    new anchor.BN(nonce.toString())
                )
                .accountsPartial({
                    user,
                    bridgeConfig: this.bridgeConfigPda,
                    depositIntent: depositIntentPda,
                    payer: this.payer.publicKey,
                    signPdaAccount,
                    mxeAccount: arciumAccounts.mxeAccount,
                    mempoolAccount: arciumAccounts.mempoolAccount,
                    executingPool: arciumAccounts.executingPool,
                    computationAccount: arciumAccounts.computationAccount,
                    compDefAccount: arciumAccounts.compDefAccount,
                    clusterAccount: arciumAccounts.clusterAccount,
                    arciumProgram: arciumAccounts.arciumProgram,
                    systemProgram: SystemProgram.programId,
                })
                .signers([this.payer])
                .rpc({ commitment: "confirmed", skipPreflight: true });

            console.log("  Attestation submitted:", signature);
            return { signature, success: true };
        } catch (error) {
            console.error("  Failed to submit attestation:", error);
            throw error;
        }
    }

    /**
     * Create burn intent for withdrawal (PRIVACY-PRESERVING)
     * 
     * The Zcash address is hashed before submission.
     * Solana stores the hash, MPC nodes receive the actual address off-chain.
     */
    async createBurnIntent(
        user: PublicKey,
        amount: anchor.BN,
        zcashAddress: string
    ): Promise<{ burnId: number; signature: string }> {
        console.log("Creating burn intent...");

        // Get current burn nonce
        const config = await (this.program.account as any).bridgeConfig.fetch(this.bridgeConfigPda);
        const burnId = config.burnNonce.toNumber();

        // Hash the Zcash address (privacy: actual address sent to MPC off-chain)
        const { createHash } = await import("crypto");
        const zcashAddressHash = createHash("sha256")
            .update(zcashAddress)
            .digest();

        // Derive burn intent PDA
        const [burnIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("burn-intent"),
                user.toBuffer(),
                new anchor.BN(burnId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        // Get user's token account
        const userTokenAccount = await getAssociatedTokenAddress(
            this.szecMintPda,
            user
        );

        const signature = await this.program.methods
            .burnForWithdrawal(
                amount,
                Array.from(zcashAddressHash) as any
            )
            .accountsPartial({
                user,
                bridgeConfig: this.bridgeConfigPda,
                burnIntent: burnIntentPda,
                szecMint: this.szecMintPda,
                userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.payer])
            .rpc({ commitment: "confirmed", skipPreflight: true });

        console.log("  Burn intent created:", burnId);
        return { burnId, signature };
    }

    /**
     * Finalize withdrawal after Zcash TX is mined
     * Called by MPC authority after successful Zcash transaction
     */
    async finalizeWithdrawal(
        burnId: number,
        user: PublicKey,
        zcashTxid: Uint8Array,
        mpcAuthority: Keypair,
        success: boolean = true
    ): Promise<string> {
        console.log("Finalizing withdrawal...");

        // Derive burn intent PDA
        const [burnIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("burn-intent"),
                user.toBuffer(),
                new anchor.BN(burnId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        // Pad or truncate txid to 32 bytes
        const txidArray = new Uint8Array(32);
        txidArray.set(zcashTxid.slice(0, 32));

        const signature = await this.program.methods
            .finalizeWithdrawal(
                Array.from(txidArray) as any,
                success
            )
            .accountsPartial({
                authority: mpcAuthority.publicKey,
                bridgeConfig: this.bridgeConfigPda,
                burnIntent: burnIntentPda,
            })
            .signers([mpcAuthority])
            .rpc({ commitment: "confirmed", skipPreflight: true });

        console.log("  Withdrawal finalized:", signature);
        return signature;
    }

    /**
     * Check if a note commitment has been claimed
     */
    async isNoteClaimed(noteCommitment: Uint8Array): Promise<boolean> {
        const [claimTrackerPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("claim-tracker"), noteCommitment],
            this.programId
        );

        try {
            await (this.program.account as any).claimTracker.fetch(claimTrackerPda);
            return true; // Account exists = claimed
        } catch {
            return false; // Account doesn't exist = not claimed
        }
    }

    /**
     * Get deposit intent state
     */
    async getDepositIntent(depositId: number, user: PublicKey): Promise<any> {
        const [depositIntentPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("deposit-intent"),
                user.toBuffer(),
                new anchor.BN(depositId).toArrayLike(Buffer, "le", 8),
            ],
            this.programId
        );

        return (this.program.account as any).depositIntent.fetch(depositIntentPda);
    }

    /**
     * Get bridge config
     */
    async getBridgeConfig(): Promise<any> {
        return (this.program.account as any).bridgeConfig.fetch(this.bridgeConfigPda);
    }

    get payerPublicKey(): PublicKey {
        return this.payer.publicKey;
    }
}

