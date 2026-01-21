"""
Image generation utility - lightweight HTTP-based implementation.
"""
import httpx
import base64
import uuid
from typing import List, Dict, Any, Optional
from enum import Enum
import config
from shared_libs.libs.logger import log
from shared_libs.libs.storage_client import upload_to_s3

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


class AspectRatio(Enum):
    """Supported aspect ratios."""
    RATIO_1_1 = "1:1"
    RATIO_2_3 = "2:3"
    RATIO_3_2 = "3:2"
    RATIO_16_9 = "16:9"
    RATIO_9_16 = "9:16"
    RATIO_4_3 = "4:3"
    RATIO_3_4 = "3:4"
    RATIO_4_5 = "4:5"
    RATIO_5_4 = "5:4"
    RATIO_21_9 = "21:9"


class OutputFormat(Enum):
    """Supported output formats."""
    JPEG = "jpeg"
    JPG = "jpg"
    PNG = "png"
    WEBP = "webp"


async def fetch_image_bytes(url: str) -> tuple[bytes, str]:
    """Fetch image from URL and return bytes with mime type."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        
        content_type = response.headers.get("content-type", "image/jpeg")
        if "png" in content_type:
            mime_type = "image/png"
        elif "webp" in content_type:
            mime_type = "image/webp"
        else:
            mime_type = "image/jpeg"
        
        return response.content, mime_type


async def generate_image(
    prompt: str,
    images: Optional[List[Dict[str, str]]] = None,
    tag: str = "generated",
    aspect_ratio: AspectRatio = AspectRatio.RATIO_1_1,
    output_format: OutputFormat = OutputFormat.JPEG,
) -> Dict[str, Any]:
    """
    Generate an image using Gemini's image generation capabilities.
    
    Args:
        prompt: Text prompt for image generation
        images: Optional list of reference images [{"url": "...", "name": "..."}]
        tag: Tag for the generated image
        aspect_ratio: Desired aspect ratio
        output_format: Output image format
        
    Returns:
        Dict with 'url', 'id', 'tag', 'source' or 'error'
    """
    if not config.GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not configured"}
    
    log.info(f"Generating image with prompt: {prompt[:100]}...")
    
    # Build parts array
    parts = []
    
    # Add reference images if provided
    if images:
        for img in images:
            url = img.get("url", "")
            name = img.get("name", "reference")
            if url:
                try:
                    img_bytes, mime_type = await fetch_image_bytes(url)
                    base64_data = base64.b64encode(img_bytes).decode("utf-8")
                    parts.append({
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64_data
                        }
                    })
                    log.info(f"Added reference image: {name}")
                except Exception as e:
                    log.warning(f"Failed to fetch image {name}: {e}")
    
    # Add the prompt
    parts.append({"text": prompt})
    
    # Build request
    request_body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 1.0,
            "topP": 0.95,
            "responseModalities": ["image", "text"],
        }
    }
    
    # Use Gemini 3 Pro Image Preview for image generation
    model = "gemini-3-pro-image-preview"
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent?key={config.GEMINI_API_KEY}"
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                json=request_body,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                error_text = response.text
                log.error(f"Gemini API error: {response.status_code} - {error_text}")
                return {"error": f"Gemini API error: {response.status_code} - {error_text[:200]}"}
            
            result = response.json()
        
        # Look for image in response
        candidates = result.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            for part in content.get("parts", []):
                if "inlineData" in part:
                    inline_data = part["inlineData"]
                    image_data = base64.b64decode(inline_data["data"])
                    mime = inline_data.get("mimeType", "image/jpeg")
                    
                    # Determine extension
                    ext = "jpg"
                    if "png" in mime:
                        ext = "png"
                    elif "webp" in mime:
                        ext = "webp"
                    
                    # Upload to S3
                    unique_id = uuid.uuid4().hex[:8]
                    filename = f"{tag}_{unique_id}.{ext}"
                    s3_url = await upload_to_s3(filename, image_data)
                    
                    return {
                        "url": s3_url,
                        "id": filename,
                        "tag": tag,
                        "source": "Gemini"
                    }
        
        # Check for text response (might explain why no image)
        text_response = ""
        if candidates:
            for part in candidates[0].get("content", {}).get("parts", []):
                if "text" in part:
                    text_response += part["text"]
        
        return {"error": f"No image generated. Response: {text_response[:200]}"}
        
    except Exception as e:
        log.error(f"Image generation failed: {e}")
        return {"error": str(e)}
