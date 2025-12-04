#!/bin/bash
# Hydex Bridge API - Full Test Script
# Tests the complete deposit and withdrawal flows

API_URL="${API_URL:-http://localhost:3001}"
API_KEY="${API_KEY:-hydex-internal-key}"
WALLET="BEG25tf1n2HJiC68rcrNUU7PnpPDogsRxZ5jdwHtgzjz"

echo "========================================"
echo "  HYDEX BRIDGE API - Full Test Suite"
echo "========================================"
echo "API URL: $API_URL"
echo ""

# Health Check
echo "[1/8] Health Check"
curl -s "$API_URL/health"
echo -e "\n"

# Auth Challenge
echo "[2/8] Auth Challenge"
CHALLENGE_RESP=$(curl -s -X POST "$API_URL/v1/auth/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"solana_pubkey\": \"$WALLET\"}")
echo "$CHALLENGE_RESP"
NONCE=$(echo "$CHALLENGE_RESP" | grep -o '"nonce":"[^"]*"' | cut -d'"' -f4)
echo "   Nonce: $NONCE"
echo ""

# ========================================
# DEPOSIT FLOW
# ========================================
echo "========================================"
echo "  DEPOSIT FLOW"
echo "========================================"

# Create deposit
echo "[3/8] Create deposit intent"
DEPOSIT_RESP=$(curl -s -X POST "$API_URL/v1/internal/deposits" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"solana_recipient\": \"$WALLET\", \"network\": \"testnet\"}")
echo "$DEPOSIT_RESP"
DEPOSIT_ID=$(echo "$DEPOSIT_RESP" | grep -o '"deposit_id":[0-9]*' | cut -d':' -f2)
echo "   Deposit ID: $DEPOSIT_ID"
echo ""

# Set unified address (enclave simulation)
echo "[4/8] Set unified address (enclave)"
curl -s -X POST "$API_URL/v1/internal/deposits/$DEPOSIT_ID/set-ua" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"unified_address": "u1testaddress1234567890abcdef"}'
echo -e "\n"

# Submit attestation
echo "[5/8] Submit attestation"
curl -s -X POST "$API_URL/v1/internal/attestations" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"deposit_id\": $DEPOSIT_ID,
    \"note_commitment\": \"abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234\",
    \"amount\": 100000000,
    \"recipient_solana\": \"$WALLET\",
    \"block_height\": 2500000,
    \"enclave_signature\": \"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\",
    \"enclave_pubkey\": \"cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe\"
  }"
echo -e "\n"

# Check deposit status
echo "[6/8] Verify deposit status"
curl -s "$API_URL/v1/internal/deposits" \
  -H "X-API-Key: $API_KEY"
echo -e "\n"

# ========================================
# WITHDRAWAL FLOW (Mock)
# ========================================
echo "========================================"
echo "  WITHDRAWAL FLOW (Mock)"
echo "========================================"

# List burns (should be empty)
echo "[7/8] List burn intents"
curl -s "$API_URL/v1/internal/burns" \
  -H "X-API-Key: $API_KEY"
echo -e "\n"

# Note: Actual burn creation requires JWT auth
echo "[8/8] Burn flow note"
echo "   Burn intents require JWT auth from wallet signature."
echo "   Flow: User signs message -> Gets JWT -> POST /v1/burn-intents"
echo "   Then: MPC nodes finalize -> POST /v1/internal/burn-intents/:id/finalize"
echo ""

echo "========================================"
echo "  ALL TESTS COMPLETE!"
echo "========================================"
echo ""
echo "Privacy features:"
echo "  - Attestations encrypted via Arcium before Solana submission"
echo "  - Zcash addresses encrypted via Arcium before Solana submission"
echo "  - No plaintext sensitive data on Solana blockchain"
