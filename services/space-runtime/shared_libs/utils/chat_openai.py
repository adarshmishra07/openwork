"""
OpenAI chat utility - lightweight HTTP-based implementation.
"""
import httpx
from typing import List, Any, Optional
import config
from shared_libs.libs.logger import log

OPENAI_API_BASE = "https://api.openai.com/v1"


class OpenAIResponse:
    """Response wrapper for OpenAI API."""
    def __init__(self, content: str):
        self.content = content


async def chat_openai(
    messages: List[Any],
    model: str = "gpt-4o",
    temperature: float = 0.7,
    timeout: float = 120.0,
    max_tokens: Optional[int] = None,
    api_key: Optional[str] = None,
    fallback_to_gemini: bool = False,
) -> OpenAIResponse:
    """
    Chat with OpenAI model using direct HTTP API.
    """
    effective_key = api_key or config.get_openai_api_key()
    if not effective_key:
        if fallback_to_gemini:
            log.info(f"No OpenAI key available, falling back to Gemini")
            from shared_libs.utils.chat_gemini import chat_gemini
            result = await chat_gemini(messages)
            return OpenAIResponse(content=result.content)
        raise ValueError("OPENAI_API_KEY not configured and no api_key provided")

    log.info(f"Calling OpenAI model: {model}")
    
    # Map model names
    model_map = {
        "gpt-5.1": "gpt-4o",
        "gpt-4o-mini": "gpt-4o-mini",
        "gpt-4o": "gpt-4o",
        "gpt-4-turbo": "gpt-4-turbo",
    }
    actual_model = model_map.get(model, model)
    
    # Convert messages to OpenAI format
    openai_messages = []
    
    for msg in messages:
        # Handle different message types
        if hasattr(msg, "content") and hasattr(msg, "type"):
            # LangChain-style message
            msg_type = getattr(msg, "type", "user")
            if msg_type == "human":
                role = "user"
            elif msg_type == "system":
                role = "system"
            elif msg_type == "ai":
                role = "assistant"
            else:
                role = "user"
            content = msg.content
        elif isinstance(msg, dict):
            role = msg.get("role", "user")
            content = msg.get("content", "")
        else:
            role = "user"
            content = str(msg)
        
        openai_messages.append({
            "role": role,
            "content": content
        })
    
    # Build request body
    request_body = {
        "model": actual_model,
        "messages": openai_messages,
        "temperature": temperature,
    }
    
    if max_tokens:
        request_body["max_tokens"] = max_tokens
    
    # Make API request
    url = f"{OPENAI_API_BASE}/chat/completions"
    
    log.info(f"Making OpenAI request to {url} with timeout {timeout}s")
    log.info(f"Request body (truncated): model={request_body.get('model')}, messages count={len(request_body.get('messages', []))}")
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                url,
                json=request_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {effective_key}"
                }
            )
        except httpx.TimeoutException as e:
            log.error(f"OpenAI request timed out after {timeout}s: {str(e)}")
            raise Exception(f"OpenAI request timed out after {timeout}s")
        except httpx.RequestError as e:
            log.error(f"OpenAI request failed: {str(e)}")
            raise Exception(f"OpenAI request failed: {str(e)}")
        
        log.info(f"OpenAI response status: {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text
            log.error(f"OpenAI API error: {response.status_code} - {error_text}")
            raise Exception(f"OpenAI API error: {response.status_code} - {error_text}")
        
        response_text = response.text
        log.info(f"OpenAI response length: {len(response_text)} chars")
        
        if not response_text or response_text.strip() == "":
            log.error("OpenAI returned empty response")
            raise Exception("OpenAI returned empty response")
        
        try:
            result = response.json()
        except Exception as e:
            log.error(f"Failed to parse OpenAI response as JSON: {response_text[:500]}")
            raise Exception(f"Failed to parse OpenAI response: {str(e)}")
    
    # Extract text from response
    try:
        text = result["choices"][0]["message"]["content"]
        log.info(f"OpenAI response received: {len(text)} chars")
        return OpenAIResponse(content=text)
    except (KeyError, IndexError) as e:
        log.error(f"Failed to parse OpenAI response: {result}")
        raise Exception(f"Failed to parse OpenAI response: {e}")
