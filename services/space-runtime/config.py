"""
Configuration for Space Runtime.
Loads environment variables and provides config access.
"""
import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PRODIA_API_KEY = os.getenv("PRODIA_API_KEY", "")

# AWS
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "brandwork-assets")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Runtime
STAGE = os.getenv("STAGE", "dev")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
