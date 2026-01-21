#!/bin/bash

# BrandWork Space Runtime - Local Test Script
# Tests the locally running space runtime

BASE_URL=${1:-http://localhost:8765}

echo "=========================================="
echo "Testing Space Runtime"
echo "URL: $BASE_URL"
echo "=========================================="

# Health check
echo ""
echo "1. Health Check"
echo "---------------"
curl -s "$BASE_URL/health" | jq .

# List spaces
echo ""
echo "2. List Spaces"
echo "--------------"
curl -s "$BASE_URL/spaces" | jq '.[].name'

# Match prompt
echo ""
echo "3. Match Prompt: 'remove background from my product'"
echo "----------------------------------------------------"
curl -s -X POST "$BASE_URL/match?prompt=remove%20background%20from%20my%20product" | jq '{matched, space_name: .space.name, confidence}'

# Match prompt 2
echo ""
echo "4. Match Prompt: 'swap my product into this scene'"
echo "--------------------------------------------------"
curl -s -X POST "$BASE_URL/match?prompt=swap%20my%20product%20into%20this%20scene" | jq '{matched, space_name: .space.name, confidence}'

echo ""
echo "=========================================="
echo "Tests complete!"
echo "=========================================="
