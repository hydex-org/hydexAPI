/**
 * Hydex Bridge API
 * 
 * Privacy-preserving orchestrator for Zcash-Solana bridge.
 * All sensitive data is encrypted via Arcium before Solana submission.
 * 
 * Per Hydex Spec Section 5.6
 */

import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { authRouter } from "./routes/auth.js";
import { depositRouter } from "./routes/deposits.js";
import { burnRouter } from "./routes/burns.js";
import { internalRouter } from "./routes/internal.js";
import { zcashRouter } from "./routes/zcash.js";

config();

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_, res) => {
    res.json({ status: "ok", service: "hydex-api", version: "1.0.0" });
});

// API Routes (per Hydex Spec Section 5.6)
app.use("/v1/auth", authRouter);
app.use("/v1/deposit-intents", depositRouter);
app.use("/v1/burn-intents", burnRouter);
app.use("/v1/internal", internalRouter);
app.use("/v1/zec", zcashRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("API Error:", err);
    res.status(500).json({
        error: {
            code: "INTERNAL_ERROR",
            message: err.message || "Something went wrong",
        },
    });
});

app.listen(PORT, () => {
    console.log(`
=====================================
  HYDEX BRIDGE API
=====================================
  Port: ${PORT}
  Network: ${process.env.SOLANA_NETWORK || "devnet"}
  
  Endpoints:
    POST /v1/auth/challenge
    POST /v1/auth/verify-wallet
    
    POST /v1/deposit-intents
    GET  /v1/deposit-intents/:id
    GET  /v1/deposit-intents
    
    POST /v1/burn-intents
    GET  /v1/burn-intents/:id
    GET  /v1/burn-intents
    
    POST /v1/internal/attestations
    POST /v1/internal/burn-intents/:id/finalize
    
    POST /v1/zec/emit_orchard
=====================================
  `);
});

export default app;

