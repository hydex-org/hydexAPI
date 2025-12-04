/**
 * Internal API Routes
 * Per Hydex Spec Section 5.6.3.4 and 5.6.4.4
 *
 * These endpoints are called by trusted internal services:
 * - Enclave (for attestations)
 * - MPC nodes (for withdrawal finalization)
 */
export declare const internalRouter: import("express-serve-static-core").Router;
