#!/bin/bash

# BrandWork Space Runtime - Setup Script
# Run this script to set up the local development environment

set -e

echo "=========================================="
echo "BrandWork Space Runtime Setup"
echo "=========================================="

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
if [[ "$PYTHON_VERSION" < "3.11" ]]; then
    echo "Error: Python 3.11+ required. Found: $PYTHON_VERSION"
    exit 1
fi
echo "Python version: $PYTHON_VERSION"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Install Node dependencies (for Serverless)
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ""
    echo "=========================================="
    echo "IMPORTANT: Edit .env with your API keys!"
    echo "=========================================="
    echo ""
    echo "Required keys:"
    echo "  - GEMINI_API_KEY: https://aistudio.google.com/apikey"
    echo "  - OPENAI_API_KEY: https://platform.openai.com/api-keys"
    echo "  - AWS_S3_BUCKET: Your S3 bucket name"
    echo "  - AWS credentials for local development"
    echo ""
fi

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "To run locally:"
echo "  source venv/bin/activate"
echo "  python -m uvicorn handler:app --reload --port 8765"
echo ""
echo "To deploy to AWS:"
echo "  source .env && export GEMINI_API_KEY OPENAI_API_KEY AWS_S3_BUCKET AWS_REGION"
echo "  npx serverless deploy --stage dev"
echo ""
