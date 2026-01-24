"""
Storage client for uploading files to S3.
"""
import boto3
import httpx
import uuid
from io import BytesIO
from typing import Optional
from urllib.parse import quote
import config
from shared_libs.libs.logger import log


async def file_from_url(url: str) -> BytesIO:
    """
    Download a file from URL and return as BytesIO.
    
    Args:
        url: URL to download from
        
    Returns:
        BytesIO object containing the file data
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return BytesIO(response.content)


async def upload_to_s3(
    filename: str,
    file_bytes: bytes,
    content_type: Optional[str] = None,
    folder: str = "generated"
) -> str:
    """
    Upload a file to S3 and return the public URL.
    
    Args:
        filename: Name for the file
        file_bytes: File content as bytes
        content_type: MIME type (auto-detected if not provided)
        folder: S3 folder/prefix
        
    Returns:
        Public URL of the uploaded file
    """
    if not config.AWS_S3_BUCKET:
        raise ValueError("AWS_S3_BUCKET not configured")
    
    # Generate unique key
    unique_id = uuid.uuid4().hex[:8]
    key = f"{folder}/{unique_id}_{filename}"
    
    # Auto-detect content type
    if content_type is None:
        if filename.endswith(".png"):
            content_type = "image/png"
        elif filename.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif filename.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "application/octet-stream"
    
    try:
        s3_client = boto3.client(
            "s3",
            region_name=config.AWS_REGION,
        )
        
        # Upload object - bucket policy must allow public read for generated/ prefix
        s3_client.put_object(
            Bucket=config.AWS_S3_BUCKET,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )
        
        # Return public URL (URL-encode the key to handle special characters)
        encoded_key = quote(key, safe='/')
        url = f"https://{config.AWS_S3_BUCKET}.s3.{config.AWS_REGION}.amazonaws.com/{encoded_key}"
        log.info(f"Uploaded to S3: {url}")
        return url
        
    except Exception as e:
        log.error(f"Failed to upload to S3: {e}")
        raise
