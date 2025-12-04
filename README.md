# Hydex Bridge API

Stateless orchestrator for the Hydex Zcash-Solana bridge per [Hydex Spec Section 5.6](../docs/hydex-spec.md).

## Architecture

```
                    +------------------+
                    |    Frontend      |
                    +--------+---------+
                             |
               REST API (public endpoints)
                             |
                    +--------v---------+
                    |   Bridge API     |  <-- This service
                    |   (port 3001)    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+   +-----v------+  +----v-----+
     |  Enclave   |   |   Solana   |  |   MPC    |
     | (port 8089)|   |  (devnet)  |  |  Nodes   |
     +------------+   +------------+  +----------+
```

## Privacy Features

- Attestations encrypted via Arcium (x25519 + RescueCipher) before Solana submission
- Zcash withdrawal addresses encrypted before Solana submission
- No plaintext sensitive data appears on the Solana blockchain

## Quick Start

### Local Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run
PORT=3001 node dist/index.js

# Test
./test-api.sh
```

### Docker

```bash
# Build image
docker build -t hydex-bridge-api:latest .

# Run container
docker run -d -p 3001:3001 \
  -e PORT=3001 \
  -e SOLANA_RPC_URL=https://api.devnet.solana.com \
  hydex-bridge-api:latest
```

## API Endpoints

### Public (User-facing)

| Method | Path                    | Description                   |
| ------ | ----------------------- | ----------------------------- |
| GET    | /health                 | Health check                  |
| POST   | /v1/auth/challenge      | Get auth challenge for wallet |
| POST   | /v1/auth/verify-wallet  | Verify signature, get JWT     |
| POST   | /v1/deposit-intents     | Create deposit intent         |
| GET    | /v1/deposit-intents/:id | Get deposit status            |
| GET    | /v1/deposit-intents     | List user deposits            |
| POST   | /v1/burn-intents        | Create withdrawal request     |
| GET    | /v1/burn-intents/:id    | Get withdrawal status         |
| GET    | /v1/burn-intents        | List user withdrawals         |

### Internal (Service-to-service)

Requires `X-API-Key` header.

| Method | Path                                   | Description                    |
| ------ | -------------------------------------- | ------------------------------ |
| POST   | /v1/internal/attestations              | Submit deposit attestation     |
| POST   | /v1/internal/burn-intents/:id/finalize | Finalize withdrawal            |
| GET    | /v1/internal/deposits                  | List all deposits (monitoring) |
| GET    | /v1/internal/burns                     | List all burns (monitoring)    |
| POST   | /v1/internal/deposits                  | Create test deposit            |
| POST   | /v1/internal/deposits/:id/set-ua       | Set unified address            |

### Legacy/Zcash

| Method | Path                 | Description                     |
| ------ | -------------------- | ------------------------------- |
| POST   | /v1/zec/emit_orchard | Forward Orchard data to enclave |

## Configuration

Copy `config.example.json` to `config.json`:

```json
{
  "server": { "port": 3001 },
  "solana": {
    "network": "devnet",
    "rpc_url": "https://api.devnet.solana.com",
    "program_id": "5PLQ9ZSbYq4qfYic3dCwyr1BR8GMVfCKWsbTan2VWE45"
  },
  "arcium": {
    "enabled": true,
    "program_id": "Bv3Fb9VjzjWGfX18QTUcVycAfeLoQ5zZN6vv2g3cTZxp"
  },
  "security": {
    "jwt_secret": "change-this-in-production",
    "internal_api_key": "hydex-internal-key"
  }
}
```

## Flows

### Deposit Flow

1. User calls `POST /v1/deposit-intents` (with JWT)
2. Bridge API creates deposit on Solana
3. Bridge API calls enclave for UA generation
4. User sends ZEC to unified address
5. Enclave detects deposit, calls `POST /v1/internal/attestations`
6. Bridge API encrypts attestation via Arcium
7. Bridge API submits encrypted TX to Solana
8. Arcium MPC decrypts, verifies, mints sZEC

### Withdrawal Flow

1. User calls `POST /v1/burn-intents` (with JWT + Zcash address)
2. Bridge API encrypts Zcash address via Arcium
3. Bridge API submits encrypted burn to Solana
4. Solana burns sZEC, creates encrypted burn intent
5. MPC nodes coordinate FROST signature
6. MPC nodes call `POST /v1/internal/burn-intents/:id/finalize`
7. ZEC sent to user's private Zcash address
