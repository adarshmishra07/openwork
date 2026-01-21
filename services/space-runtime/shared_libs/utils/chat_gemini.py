"""
Gemini chat utility - lightweight HTTP-based implementation.
"""
import httpx
import json
import base64
from typing import List, Dict, Any, Optional
import config
from shared_libs.libs.logger import log

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiResponse:
    """Response wrapper for Gemini API."""
    def __init__(self, content: str):
        self.content = content


async def fetch_image_as_base64(url: str) -> tuple[str, str]:
    """Fetch image from URL and return as base64 with mime type."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        
        content_type = response.headers.get("content-type", "image/jpeg")
        if "png" in content_type:
            mime_type = "image/png"
        elif "webp" in content_type:
            mime_type = "image/webp"
        elif "gif" in content_type:
            mime_type = "image/gif"
        else:
            mime_type = "image/jpeg"
        
        base64_data = base64.b64encode(response.content).decode("utf-8")
        return base64_data, mime_type


async def chat_gemini(
    messages: List[Dict[str, Any]],
    model: str = "gemini-2.0-flash",
    temperature: float = 0.7,
    timeout: int = 120,
    max_tokens: Optional[int] = None,
) -> GeminiResponse:
    """
    Chat with Gemini model using direct HTTP API.
    """
    if not config.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not configured")
    
    log.info(f"Calling Gemini model: {model}")
    
    # Map model names - use latest available models
    model_map = {
        "gemini-2.5-pro": "gemini-2.5-pro",
        "gemini-2.5-flash": "gemini-2.5-flash",
        "gemini-2.0-flash": "gemini-2.0-flash", 
        "gemini-1.5-pro": "gemini-1.5-pro",
        "gemini-1.5-flash": "gemini-1.5-flash",
    }
    actual_model = model_map.get(model, "gemini-2.5-flash")
    
    # Build contents array
    contents = []
    system_instruction = None
    
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "system":
            system_instruction = content if isinstance(content, str) else str(content)
            continue
        
        parts = []
        
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        parts.append({"text": item.get("text", "")})
                    elif item.get("type") == "image_url":
                        image_url = item.get("image_url", {}).get("url", "")
                        if image_url:
                            try:
                                base64_data, mime_type = await fetch_image_as_base64(image_url)
                                parts.append({
                                    "inline_data": {
                                        "mime_type": mime_type,
                                        "data": base64_data
                                    }
                                })
                            except Exception as e:
                                log.warning(f"Failed to fetch image: {e}")
                                parts.append({"text": f"[Image: {image_url}]"})
                else:
                    parts.append({"text": str(item)})
        else:
            parts.append({"text": str(content)})
        
        gemini_role = "user" if role == "user" else "model"
        contents.append({"role": gemini_role, "parts": parts})
    
    # Build request body
    request_body = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
        }
    }
    
    if max_tokens:
        request_body["generationConfig"]["maxOutputTokens"] = max_tokens
    
    if system_instruction:
        request_body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    
    # Make API request
    url = f"{GEMINI_API_BASE}/models/{actual_model}:generateContent?key={config.GEMINI_API_KEY}"
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            json=request_body,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            error_text = response.text
            log.error(f"Gemini API error: {response.status_code} - {error_text}")
            raise Exception(f"Gemini API error: {response.status_code} - {error_text}")
        
        result = response.json()
    
    # Extract text from response
    try:
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        log.info(f"Gemini response received: {len(text)} chars")
        return GeminiResponse(content=text)
    except (KeyError, IndexError) as e:
        log.error(f"Failed to parse Gemini response: {result}")
        raise Exception(f"Failed to parse Gemini response: {e}")
