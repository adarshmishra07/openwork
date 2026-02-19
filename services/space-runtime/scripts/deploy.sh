#!/bin/bash

# BrandWork Space Runtime - Deploy Script
# Deploys the space runtime to AWS Lambda
# API keys are now provided by users via headers (BYOK model)

set -e

STAGE=${1:-dev}

echo "=========================================="
echo "Deploying Space Runtime to AWS Lambda"
echo "Stage: $STAGE"
echo "=========================================="

# Check Docker (needed for native dependencies like PIL)
if ! docker info > /dev/null 2>&1; then
    echo "Warning: Docker not running. Starting Docker..."
    open -a Docker
    echo "Waiting for Docker to start..."
    sleep 10
fi

# Clean previous build
echo "Cleaning previous build..."
rm -rf .serverless

# Deploy
echo "Deploying to $STAGE..."
npx serverless deploy --stage $STAGE

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Test your deployment:"
echo "  curl \$(npx serverless info --stage $STAGE | grep 'ANY -' | head -1 | awk '{print \$3}')/health"
echo ""
