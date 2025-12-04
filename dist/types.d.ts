/**
 * Hydex Bridge API Types
 * Per Hydex Spec Section 6 - Data Models
 */
export type DepositStatus = "Pending" | "AddressGenerated" | "Detected" | "Minted" | "Failed";
export interface DepositIntent {
    deposit_id: number;
    user_id: string;
    solana_recipient: string;
    unified_address: string | null;
    ua_length: number;
    note_commitment: string | null;
    detected_block_height: number | null;
    amount: string | null;
    status: DepositStatus;
    failure_reason: string | null;
    network: "mainnet" | "testnet";
    created_at: string;
    updated_at: string;
}
export interface CreateDepositRequest {
    idempotency_key: string;
    solana_recipient: string;
    expected_amount?: string;
    memo?: string;
    network: "mainnet" | "testnet";
}
export type BurnStatus = "Pending" | "Processing" | "Completed" | "Failed";
export interface BurnIntent {
    burn_id: number;
    user_id: string;
    user: string;
    amount: string;
    zcash_address_hash: string;
    status: BurnStatus;
    solana_burn_txid: string | null;
    zcash_txid: string | null;
    failure_reason: string | null;
    network: "mainnet" | "testnet";
    created_at: string;
    updated_at: string;
}
export interface CreateBurnRequest {
    idempotency_key: string;
    user: string;
    amount: string;
    zcash_address: string;
    network: "mainnet" | "testnet";
}
export interface AttestationInput {
    note_commitment: Uint8Array;
    amount: bigint;
    recipient_solana: Uint8Array;
    block_height: bigint;
    enclave_signature: Uint8Array;
    enclave_pubkey: Uint8Array;
}
export interface EnclaveAttestation {
    deposit_id: number;
    note_commitment: string;
    amount: string;
    recipient_solana: string;
    block_height: number;
    enclave_signature: string;
    enclave_pubkey: string;
    raw_attestation_payload?: string;
}
export interface AuthChallenge {
    challenge: string;
    nonce: string;
    expires_at: string;
}
export interface AuthSession {
    user_id: string;
    solana_pubkey: string;
    authenticated: boolean;
    access_token: string;
    created: boolean;
}
export type ErrorCode = "INVALID_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "DEPOSIT_NOT_FOUND" | "BURN_NOT_FOUND" | "ATTESTATION_INVALID" | "INSUFFICIENT_BALANCE" | "CHAIN_UNAVAILABLE" | "RATE_LIMITED" | "INTERNAL_ERROR";
export interface ApiError {
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
}
export interface HydexConfig {
    solana: {
        rpc_url: string;
        program_id: string;
        keypair_path: string;
    };
    enclave: {
        url: string;
    };
    mpc: {
        nodes: string[];
    };
    jwt_secret: string;
}
