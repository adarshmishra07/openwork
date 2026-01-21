# Space Runtime - BrandWork Python Spaces Service

This service executes Python-based "spaces" (AI workflows) on AWS Lambda. Spaces are pre-built workflows for image generation, style transfer, and other AI tasks.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BrandWork Desktop (Electron)                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ User Prompt  │───▶│ Space        │───▶│ HTTP Client  │      │
│  │              │    │ Selector     │    │              │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │ HTTPS
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  AWS API Gateway + Lambda (this service)                        │
│                                                                  │
│  Endpoints:                                                     │
│  - GET  /health              Health check                       │
│  - GET  /spaces              List all spaces                    │
│  - GET  /spaces/{id}         Get space details                  │
│  - POST /match?prompt=...    Match prompt to space              │
│  - POST /spaces/{id}/execute Execute a space                    │
│                                                                  │
│  Spaces:                                                        │
│  ├── product_swap.py         Product placement                  │
│  ├── steal_the_look.py       Editorial style transfer           │
│  ├── sketch_to_product.py    Sketch to photorealistic render    │
│  └── background_remover.py   Remove image backgrounds           │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
          ┌─────────────────┐
          │   AI APIs       │
          │  - Gemini       │
          │  - OpenAI       │
          │  - Prodia       │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │   AWS S3        │
          │  (image storage)│
          └─────────────────┘
```

## Available Spaces

| Space ID | Name | Description | APIs Used |
|----------|------|-------------|-----------|
| `product-swap` | Product Swap | Swap products between backgrounds | Gemini |
| `steal-the-look` | Steal the Look | Editorial style transfer | Gemini |
| `sketch-to-product` | Sketch to Product | Convert sketches to renders | OpenAI + Gemini |
| `background-remover` | Background Remover | Remove image backgrounds | Prodia |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- AWS CLI configured
- Docker (for deployment)

### Local Development

```bash
cd services/space-runtime

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file and add your keys
cp .env.example .env
# Edit .env with your API keys

# Run locally
python -m uvicorn handler:app --reload --port 8765

# Test
curl http://localhost:8765/health
curl http://localhost:8765/spaces
```

### Deploy to AWS

```bash
# Install Serverless Framework
npm install

# Deploy to dev
source .env && \
export GEMINI_API_KEY OPENAI_API_KEY PRODIA_API_KEY AWS_S3_BUCKET AWS_REGION && \
npx serverless deploy --stage dev

# Deploy to production
npx serverless deploy --stage prod
```

## API Reference

### Health Check
```bash
GET /health
# Response: {"status": "healthy", "stage": "dev"}
```

### List Spaces
```bash
GET /spaces
# Response: Array of space definitions with id, name, description, inputs, etc.
```

### Match Prompt to Space
```bash
POST /match?prompt=remove%20background%20from%20my%20image
# Response: {
#   "matched": true,
#   "space": { "id": "background-remover", "name": "Background Remover", ... },
#   "confidence": 0.6,
#   "matchedKeywords": ["remove background"]
# }
```

### Execute Space
```bash
POST /spaces/product-swap/execute
Content-Type: application/json

{
  "inputs": {
    "product_image": "https://example.com/product.jpg",
    "reference_image": "https://example.com/scene.jpg",
    "num_variations": 2
  }
}

# Response: {
#   "success": true,
#   "outputAssets": [
#     { "type": "image", "url": "https://s3.../generated/image.jpg" }
#   ]
# }
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `PRODIA_API_KEY` | No | Prodia API key (for background removal) |
| `AWS_S3_BUCKET` | Yes | S3 bucket for storing generated images |
| `AWS_REGION` | Yes | AWS region (e.g., ap-south-1) |
| `STAGE` | No | Environment stage (dev/prod) |

### Getting API Keys

1. **Gemini**: https://aistudio.google.com/apikey
2. **OpenAI**: https://platform.openai.com/api-keys
3. **Prodia**: https://prodia.com (sign up → API section)

## Adding New Spaces

1. Create `spaces/your_space.py`:

```python
from typing import Dict, Any
from shared_libs.libs.logger import log
from shared_libs.libs.streaming import stream_progress, stream_image
from shared_libs.utils.chat_gemini import chat_gemini
from shared_libs.utils.image_gen import generate_image

async def your_space_workflow(
    input_image: str,
    instructions: str = None,
) -> Dict[str, Any]:
    """Your space description."""
    log.info("Starting your space workflow...")
    stream_progress(id="analyze", status="completed")
    
    # Your logic here...
    
    return {
        "success": True,
        "outputAssets": [{"type": "image", "url": "..."}]
    }
```

2. Add to `spaces/registry.json`:

```json
{
  "id": "your-space",
  "name": "Your Space",
  "description": "What it does",
  "category": "images",
  "keywords": ["keyword1", "keyword2"],
  "patterns": ["regex.*pattern"],
  "inputs": [
    {"name": "input_image", "type": "image", "required": true, "description": "..."}
  ],
  "outputs": ["image"],
  "estimatedDuration": "30-60s",
  "apiProviders": ["gemini"]
}
```

3. Register in `handler.py`:

```python
class SpaceExecutor:
    SPACE_MODULES = {
        # ... existing spaces
        "your-space": ("spaces.your_space", "your_space_workflow"),
    }
```

4. Deploy: `npx serverless deploy --stage dev`

## Project Structure

```
services/space-runtime/
├── handler.py                 # FastAPI app + Lambda handler
├── config.py                  # Environment configuration
├── serverless.yml             # AWS Lambda deployment config
├── requirements.txt           # Python dependencies
├── package.json               # Node.js dependencies (Serverless)
├── .env                       # Local environment (git-ignored)
├── .env.example               # Environment template
│
├── spaces/
│   ├── __init__.py
│   ├── registry.json          # Space definitions for matching
│   ├── product_swap.py        # Product swap workflow
│   ├── steal_the_look.py      # Style transfer workflow
│   ├── sketch_to_product.py   # Sketch to render workflow
│   └── background_remover.py  # Background removal workflow
│
└── shared_libs/
    ├── __init__.py
    ├── libs/
    │   ├── logger.py          # Logging utility
    │   ├── streaming.py       # Progress streaming
    │   └── storage_client.py  # S3 upload utility
    └── utils/
        ├── chat_gemini.py     # Gemini API client
        ├── chat_openai.py     # OpenAI API client
        └── image_gen.py       # Image generation utility
```

## Troubleshooting

### "Module not found" errors
- Ensure Docker is running for deployment
- Run `npx serverless deploy --force`

### API rate limits
- Gemini free tier: 15 requests/minute, 1500/day
- Upgrade to paid tier for production use

### S3 upload fails
- Check bucket permissions in AWS console
- Ensure Lambda IAM role has S3 access

### Cold start timeouts
- First request may take 5-10 seconds
- Use provisioned concurrency for production

## Useful Commands

```bash
# View Lambda logs
npx serverless logs -f api --stage dev -t

# Remove deployment
npx serverless remove --stage dev

# Test locally with hot reload
python -m uvicorn handler:app --reload --port 8765

# Check deployed function size
npx serverless info --stage dev
```

## Production Checklist

- [ ] Use paid API tiers (Gemini, OpenAI)
- [ ] Set up CloudWatch alarms for errors
- [ ] Configure provisioned concurrency if needed
- [ ] Use AWS SSM for secrets instead of env vars
- [ ] Set up custom domain with Route53
- [ ] Enable API Gateway caching for /spaces endpoint
- [ ] Configure CORS for your specific domain
