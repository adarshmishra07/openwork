# BrandWork Spaces - AI Workflow System

Spaces are pre-built AI workflows that automatically execute based on user intent. When a user enters a prompt, the system matches it to the most appropriate space and executes it.

## How It Works

```
User Prompt: "swap my product into this lifestyle scene"
                    │
                    ▼
         ┌─────────────────────┐
         │   Space Selector    │ ← Matches keywords/patterns
         │   (Electron App)    │
         └──────────┬──────────┘
                    │ Matched: "product-swap" (60% confidence)
                    ▼
         ┌─────────────────────┐
         │   Space Runtime     │ ← AWS Lambda
         │   (Python Service)  │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    ┌─────────┐          ┌─────────┐
    │ Gemini  │          │   S3    │
    │   API   │          │ Storage │
    └─────────┘          └─────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  Generated Images   │
         │  returned to user   │
         └─────────────────────┘
```

## Available Spaces

### 1. Product Swap (`product-swap`)
Swap a product from one image into another scene/background.

**Inputs:**
- `product_image` (required): Image containing the product to extract
- `reference_image` (required): Scene to place the product into
- `additional_instructions`: Custom instructions
- `num_variations`: Number of variations (default: 2)

**Example prompts:**
- "swap my product into this lifestyle scene"
- "place this product on that background"
- "put my watch in this bedroom setting"

---

### 2. Steal the Look (`steal-the-look`)
Apply the editorial style of one image to your product photography.

**Inputs:**
- `product_image` (required): Your product image
- `reference_image` (required): Reference image with desired style
- `custom_description`: Styling instructions
- `num_variations`: Number of variations (default: 2)

**Example prompts:**
- "steal the look from this campaign photo"
- "match the style of this editorial"
- "make my product look like this vibe"

---

### 3. Sketch to Product (`sketch-to-product`)
Transform hand-drawn sketches into photorealistic product renders.

**Inputs:**
- `product_sketches` (required): Array of sketch images
- `additional_images`: Reference images (logos, textures, materials)
- `core_material`: Primary material
- `accent_color`: Accent color (HEX/RAL)
- `dimensions`: Product dimensions
- `custom_description`: Additional instructions
- `num_variations`: Number of views (default: 5)

**Example prompts:**
- "turn this sketch into a product render"
- "convert my drawing to a photorealistic image"
- "visualize this concept sketch"

---

### 4. Background Remover (`background-remover`)
Remove backgrounds from product images for clean cutouts.

**Inputs:**
- `input_image` (required): Image to process

**Example prompts:**
- "remove the background from this image"
- "make the background transparent"
- "create a cutout of this product"

## Architecture

### Electron App (Client)
- **Space Registry** (`apps/desktop/src/main/spaces/space-registry.ts`): Local copy of space definitions
- **Space Selector** (`apps/desktop/src/main/spaces/space-selector.ts`): Matches prompts to spaces
- **Runtime Client** (`apps/desktop/src/main/spaces/space-runtime-client.ts`): Calls the Lambda API

### Lambda Service (Server)
- **Location**: `services/space-runtime/`
- **Endpoint**: `https://8yivyeg6kd.execute-api.ap-south-1.amazonaws.com`
- **Handler**: FastAPI app deployed via Serverless Framework

### Space Files
Python workflow implementations:
- `services/space-runtime/spaces/product_swap.py`
- `services/space-runtime/spaces/steal_the_look.py`
- `services/space-runtime/spaces/sketch_to_product.py`
- `services/space-runtime/spaces/background_remover.py`

## Local Development

### 1. Start the Space Runtime locally

```bash
cd services/space-runtime

# Setup Python environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run the server
python -m uvicorn handler:app --reload --port 8765
```

### 2. Update Electron app to use local endpoint

In `apps/desktop/src/main/spaces/space-runtime-client.ts`, change:
```typescript
const DEFAULT_CONFIG: SpaceRuntimeConfig = {
  baseUrl: 'http://localhost:8765',  // Local development
  timeout: 300000,
};
```

### 3. Run the Electron app

```bash
pnpm dev
```

## Deployment

### Deploy to AWS Lambda

```bash
cd services/space-runtime

# Install dependencies
npm install

# Deploy (requires Docker running)
source .env
export GEMINI_API_KEY OPENAI_API_KEY PRODIA_API_KEY AWS_S3_BUCKET AWS_REGION
npx serverless deploy --stage dev

# For production
npx serverless deploy --stage prod
```

### Required AWS Permissions

The deploying IAM user needs these policies:
- AWSCloudFormationFullAccess
- AWSLambda_FullAccess
- AmazonAPIGatewayAdministrator
- AmazonS3FullAccess
- CloudWatchLogsFullAccess
- IAMFullAccess

### S3 Bucket Setup

1. Create bucket (e.g., `future-me-ai`)
2. Set region to match Lambda (e.g., `ap-south-1`)
3. Add bucket policy for public read:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/generated/*"
    }
  ]
}
```

4. Configure CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

## API Keys

| Provider | URL | Used By |
|----------|-----|---------|
| Gemini | https://aistudio.google.com/apikey | product-swap, steal-the-look, sketch-to-product |
| OpenAI | https://platform.openai.com/api-keys | sketch-to-product |
| Prodia | https://prodia.com | background-remover |

### Rate Limits

**Gemini Free Tier:**
- 15 requests/minute
- 1,500 requests/day
- Enable billing for higher limits

**OpenAI:**
- Depends on tier
- $5 free credit for new accounts

## Adding a New Space

1. **Create the Python workflow** in `services/space-runtime/spaces/your_space.py`

2. **Add to registry** in `services/space-runtime/spaces/registry.json`:
```json
{
  "id": "your-space",
  "name": "Your Space Name",
  "description": "What it does",
  "category": "images",
  "keywords": ["keyword1", "keyword2"],
  "patterns": ["regex.*pattern"],
  "inputs": [...],
  "outputs": ["image"],
  "estimatedDuration": "30-60s",
  "apiProviders": ["gemini"]
}
```

3. **Register in handler** (`services/space-runtime/handler.py`):
```python
SPACE_MODULES = {
    # ...existing
    "your-space": ("spaces.your_space", "your_space_workflow"),
}
```

4. **Update Electron registry** (`apps/desktop/src/main/spaces/space-registry.ts`)

5. **Deploy**: `npx serverless deploy --stage dev`

## Troubleshooting

### "Quota exceeded" error
- Free tier limits reached
- Solution: Enable billing or wait for daily reset

### "Module not found" on Lambda
- Docker wasn't running during deploy
- Solution: Start Docker, run `npx serverless deploy --force`

### S3 upload fails
- Check IAM permissions
- Verify bucket exists and region matches

### Cold start timeout
- First request takes 5-10s
- Solution: Use provisioned concurrency for production

## Files Reference

```
services/space-runtime/
├── handler.py              # FastAPI Lambda handler
├── config.py               # Environment config
├── serverless.yml          # Deployment config
├── requirements.txt        # Python deps
├── .env                    # Local secrets (git-ignored)
├── .env.example            # Template
├── spaces/
│   ├── registry.json       # Space definitions
│   ├── product_swap.py
│   ├── steal_the_look.py
│   ├── sketch_to_product.py
│   └── background_remover.py
└── shared_libs/
    ├── libs/
    │   ├── logger.py
    │   ├── streaming.py
    │   └── storage_client.py
    └── utils/
        ├── chat_gemini.py
        ├── chat_openai.py
        └── image_gen.py

apps/desktop/src/main/spaces/
├── space-registry.ts       # Local registry copy
├── space-selector.ts       # Prompt matching logic
└── space-runtime-client.ts # Lambda API client
```
