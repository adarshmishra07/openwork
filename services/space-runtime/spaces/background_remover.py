"""
Background remover space - uses Gemini image generation to remove backgrounds.
"""
import asyncio
import base64
import uuid
import httpx
from typing import Dict, Any
from shared_libs.libs.logger import log
from shared_libs.libs.storage_client import upload_to_s3, file_from_url
import config


async def _remove_background(body: Dict[str, Any]):
    input_image = body.get("input_image", None)
    if input_image is None:
        raise ValueError("input_image is required")

    try:
        # Fetch the input image
        image_bytes_io = await file_from_url(input_image)
        image_bytes_io.seek(0)
        img_bytes = image_bytes_io.read()
        base64_data = base64.b64encode(img_bytes).decode("utf-8")

        # Detect mime type
        mime_type = "image/jpeg"
        if img_bytes[:8].startswith(b'\x89PNG'):
            mime_type = "image/png"
        elif img_bytes[:4].startswith(b'RIFF'):
            mime_type = "image/webp"

        api_key = config.get_gemini_api_key()
        if not api_key:
            raise ValueError("GEMINI_API_KEY not configured")

        # Use Gemini to remove background
        prompt = (
            "Remove the background from this image completely. "
            "Keep only the main subject/object with a fully transparent background. "
            "Output a clean PNG with transparent background. "
            "Do not add any new elements, shadows, or effects."
        )

        request_body = {
            "contents": [{
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64_data
                        }
                    },
                    {"text": prompt}
                ]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "responseModalities": ["image", "text"],
            }
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={api_key}"

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                json=request_body,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code != 200:
                raise Exception(f"Gemini API error: {response.status_code} - {response.text[:200]}")

            result = response.json()

        # Extract image from response
        candidates = result.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            for part in content.get("parts", []):
                if "inlineData" in part:
                    inline_data = part["inlineData"]
                    image_data = base64.b64decode(inline_data["data"])

                    unique_id = uuid.uuid4().hex[:8]
                    filename = f"background_removed_{unique_id}.png"
                    s3_url = await upload_to_s3(filename, image_data, content_type="image/png")

                    return {
                        "outputAssets": [
                            {
                                "type": "image",
                                "url": s3_url,
                            }
                        ],
                        "success": True,
                    }

        # Check for text-only response
        text_response = ""
        if candidates:
            for part in candidates[0].get("content", {}).get("parts", []):
                if "text" in part:
                    text_response += part["text"]

        raise Exception(f"No image generated. Response: {text_response[:200]}")

    except Exception as e:
        log.critical(f"Error removing background: {e}", usecase="background_remover")
        return {
            "success": False,
            "error": str(e),
            "outputAssets": []
        }


def execute_background_remover(body: Dict[str, Any]):
    return asyncio.run(_remove_background(body))
