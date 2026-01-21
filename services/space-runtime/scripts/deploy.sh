#!/bin/bash

# BrandWork Space Runtime - Deploy Script
# Deploys the space runtime to AWS Lambda

set -e

STAGE=${1:-dev}

echo "=========================================="
echo "Deploying Space Runtime to AWS Lambda"
echo "Stage: $STAGE"
echo "=========================================="

# Check for .env file
if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Run ./scripts/setup.sh first."
    exit 1
fi

# Load environment variables
source .env

# Validate required variables
if [ -z "$GEMINI_API_KEY" ]; then
    echo "Error: GEMINI_API_KEY not set in .env"
    exit 1
fi

if [ -z "$AWS_S3_BUCKET" ]; then
    echo "Error: AWS_S3_BUCKET not set in .env"
    exit 1
fi

# Export variables for Serverless
export GEMINI_API_KEY
export OPENAI_API_KEY
export PRODIA_API_KEY
export AWS_S3_BUCKET
export AWS_REGION

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
