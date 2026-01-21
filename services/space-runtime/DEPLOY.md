# Deploying Space Runtime to AWS Lambda

## Step 1: Create IAM User for Deployment

1. Go to AWS IAM Console: https://console.aws.amazon.com/iam/
2. Click "Users" → "Create user"
3. Name: `brandwork-deployer`
4. Click "Next"

### Attach Permissions

Create a custom policy with these permissions (or attach `AdministratorAccess` for simplicity during development):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "logs:*",
        "iam:*",
        "apigateway:*",
        "lambda:*",
        "events:*",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs"
      ],
      "Resource": "*"
    }
  ]
}
```

Or for quick setup, attach these AWS managed policies:
- `AWSLambda_FullAccess`
- `AmazonAPIGatewayAdministrator`
- `AmazonS3FullAccess`
- `CloudWatchLogsFullAccess`
- `IAMFullAccess` (needed to create Lambda execution role)
- `AWSCloudFormationFullAccess`

5. Click "Next" → "Create user"
6. Click on the user → "Security credentials" → "Create access key"
7. Choose "CLI" → Create and download the keys

## Step 2: Configure AWS CLI

```bash
aws configure
# Enter:
# AWS Access Key ID: <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region: ap-south-1
# Default output format: json
```

Or create a profile:

```bash
aws configure --profile brandwork
```

## Step 3: Install Dependencies

```bash
cd services/space-runtime

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Install Serverless plugins
npm init -y
npm install --save-dev serverless-python-requirements
```

## Step 4: Set Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
# Edit .env with your keys
```

For deployment, you can either:

### Option A: Use environment variables directly
```bash
export GEMINI_API_KEY=your_key
export OPENAI_API_KEY=your_key
export PRODIA_API_KEY=your_key
export AWS_S3_BUCKET=future-me-ai
```

### Option B: Use AWS SSM Parameter Store (Recommended for production)
```bash
# Store secrets in SSM
aws ssm put-parameter --name "/brandwork/gemini-api-key" --value "your_key" --type SecureString
aws ssm put-parameter --name "/brandwork/openai-api-key" --value "your_key" --type SecureString
aws ssm put-parameter --name "/brandwork/prodia-api-key" --value "your_key" --type SecureString
aws ssm put-parameter --name "/brandwork/s3-bucket" --value "future-me-ai" --type String
```

Then update `serverless.yml` to use SSM:
```yaml
environment:
  GEMINI_API_KEY: ${ssm:/brandwork/gemini-api-key}
```

## Step 5: Deploy

```bash
# Make sure you're in the space-runtime directory
cd services/space-runtime

# Deploy to dev stage
serverless deploy --stage dev

# Or deploy to production
serverless deploy --stage prod

# Or with a specific AWS profile
serverless deploy --stage dev --aws-profile brandwork
```

## Step 6: Get Your API URL

After deployment, Serverless will output your API Gateway URL:

```
endpoints:
  ANY - https://xxxxxxxx.execute-api.ap-south-1.amazonaws.com/{proxy+}
```

This is your `SPACE_RUNTIME_URL` to use in the Electron app.

## Step 7: Test the Deployment

```bash
# Health check
curl https://xxxxxxxx.execute-api.ap-south-1.amazonaws.com/health

# List spaces
curl https://xxxxxxxx.execute-api.ap-south-1.amazonaws.com/spaces

# Match a prompt
curl -X POST "https://xxxxxxxx.execute-api.ap-south-1.amazonaws.com/match?prompt=remove%20background%20from%20my%20product"
```

## Step 8: Configure S3 Bucket Permissions

Your S3 bucket needs CORS and public read access for generated images:

### CORS Configuration
Go to S3 → future-me-ai → Permissions → CORS:

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

### Bucket Policy (for public read access to generated images)
Go to S3 → future-me-ai → Permissions → Bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::future-me-ai/generated/*"
    }
  ]
}
```

## Useful Commands

```bash
# View logs
serverless logs -f api --stage dev

# Remove deployment
serverless remove --stage dev

# Deploy a single function (faster)
serverless deploy function -f api --stage dev

# Invoke locally
serverless invoke local -f api --path test-event.json
```

## Troubleshooting

### "Unable to import module 'handler'"
- Make sure `serverless-python-requirements` is installed
- Try `serverless deploy --force`

### Timeout errors
- Increase `timeout` in serverless.yml (max 900 seconds)
- Image generation can take 30-60 seconds

### S3 upload fails
- Check Lambda has S3 permissions in serverless.yml
- Verify bucket exists and is in the same region

### API Key not working
- Verify environment variables are set correctly
- Check CloudWatch logs for errors
