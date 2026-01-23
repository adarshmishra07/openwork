"""
Space Runtime - AWS Lambda Handler

FastAPI application that executes Python spaces on AWS Lambda.

Required Environment Variables (set during deployment from .env):
- GEMINI_API_KEY: Google Gemini API key for image generation and LLM
- OPENAI_API_KEY: OpenAI API key for chat completions
- PRODIA_API_KEY: Prodia API key for additional image generation
- AWS_S3_BUCKET: S3 bucket for storing generated assets
- AWS_REGION_NAME: AWS region for S3

Deployed: 2026-01-22
"""
import os
import json
import asyncio
import importlib
from typing import Any, Dict, List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(
    title="BrandWork Space Runtime",
    description="Execute Python-based spaces (workflows) for image generation and processing",
    version="1.0.0",
)

# CORS for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load space registry
REGISTRY_PATH = Path(__file__).parent / "spaces" / "registry.json"

def load_registry() -> Dict[str, Any]:
    """Load the space registry from JSON file."""
    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r") as f:
            return json.load(f)
    return {"version": "1.0.0", "spaces": []}

REGISTRY = load_registry()


# === Pydantic Models ===

class SpaceInput(BaseModel):
    """Input for space execution."""
    inputs: Dict[str, Any]
    options: Optional[Dict[str, Any]] = None


class BrandAssetUpload(BaseModel):
    """Input for brand asset upload."""
    brand_id: str
    asset_type: str  # "logos", "characters", "scenes", "site-images"
    filename: str
    content_type: str
    image_base64: str


class BrandAssetResponse(BaseModel):
    """Response from brand asset upload."""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None


class ChatAttachmentUpload(BaseModel):
    """Input for chat attachment upload."""
    task_id: str
    filename: str
    content_type: str
    base64_data: str


class ChatAttachmentResponse(BaseModel):
    """Response from chat attachment upload."""
    success: bool
    url: Optional[str] = None
    file_id: Optional[str] = None
    error: Optional[str] = None


class GeneratedImageUpload(BaseModel):
    """Input for generated image upload."""
    task_id: str
    filename: str
    base64_data: str


class GeneratedImageResponse(BaseModel):
    """Response from generated image upload."""
    success: bool
    url: Optional[str] = None
    error: Optional[str] = None


class SpaceOutput(BaseModel):
    """Output from space execution."""
    success: bool
    outputAssets: List[Dict[str, Any]] = []
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SpaceInfo(BaseModel):
    """Space information for listing."""
    id: str
    name: str
    description: str
    category: str
    keywords: List[str]
    inputs: List[Dict[str, Any]]
    outputs: List[str]
    estimatedDuration: str


class MatchResult(BaseModel):
    """Result from space matching."""
    matched: bool
    space: Optional[SpaceInfo] = None
    confidence: float = 0.0
    matchedKeywords: List[str] = []


# === Space Executor ===

class SpaceExecutor:
    """Executes spaces by dynamically loading and running them."""
    
    # Maps space_id -> (module_path, function_name, call_style)
    # call_style: "kwargs" = func(**inputs), "body" = func(inputs)
    SPACE_MODULES = {
        "product-swap": ("spaces.product_swap", "product_swap_workflow", "kwargs"),
        "steal-the-look": ("spaces.steal_the_look", "steal_the_look_workflow", "kwargs"),
        "sketch-to-product": ("spaces.sketch_to_product", "_sketch_to_product_workflow", "body"),
        "background-remover": ("spaces.background_remover", "_remove_background", "body"),
        "store-display-banner": ("spaces.store_display_banner", "store_display_banner_execute", "body"),
    }
    
    @classmethod
    async def execute(cls, space_id: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a space with the given inputs."""
        if space_id not in cls.SPACE_MODULES:
            raise ValueError(f"Unknown space: {space_id}")
        
        module_path, func_name, call_style = cls.SPACE_MODULES[space_id]
        
        try:
            # Dynamic import
            module = importlib.import_module(module_path)
            func = getattr(module, func_name)
            
            # Execute (handle both sync and async functions)
            # call_style determines how to pass inputs: "kwargs" = func(**inputs), "body" = func(inputs)
            if asyncio.iscoroutinefunction(func):
                if call_style == "body":
                    result = await func(inputs)
                else:
                    result = await func(**inputs)
            else:
                # Run sync function in executor
                loop = asyncio.get_event_loop()
                if call_style == "body":
                    result = await loop.run_in_executor(None, lambda: func(inputs))
                else:
                    result = await loop.run_in_executor(None, lambda: func(**inputs))
            
            return result
            
        except ImportError as e:
            raise ValueError(f"Space module not found: {module_path}. Error: {e}")
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "outputAssets": []
            }


# === Space Matcher ===

import re
import httpx

class SpaceMatcher:
    """
    Intelligent intent-based space matching using LLM.
    
    Flow:
    1. First try fast rule-based matching for obvious cases
    2. If uncertain, use LLM to understand user intent and match to spaces
    3. Return confidence score and reasoning
    """
    
    # Gemini API for intent detection
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    
    @classmethod
    async def match(cls, prompt: str, use_llm: bool = True) -> MatchResult:
        """
        Match a prompt to the best space using intelligent intent detection.
        
        Args:
            prompt: User's natural language request
            use_llm: Whether to use LLM for intent detection (default: True)
        """
        # Step 1: Fast rule-based check for very obvious matches
        rule_result = cls._rule_based_match(prompt)
        if rule_result.confidence >= 0.8:
            return rule_result
        
        # Step 2: Use LLM for intelligent intent detection
        if use_llm:
            llm_result = await cls._llm_intent_match(prompt)
            if llm_result.matched:
                return llm_result
        
        # Step 3: Fall back to rule-based if LLM fails or is disabled
        if rule_result.matched:
            return rule_result
        
        return MatchResult(matched=False, confidence=0.0)
    
    @classmethod
    def match_sync(cls, prompt: str) -> MatchResult:
        """Synchronous version - uses only rule-based matching."""
        return cls._rule_based_match(prompt)
    
    @classmethod
    def _rule_based_match(cls, prompt: str) -> MatchResult:
        """Fast rule-based matching for obvious cases."""
        prompt_lower = prompt.lower()
        best_match = None
        best_score = 0.0
        best_keywords = []
        
        for space in REGISTRY.get("spaces", []):
            score, matched_keywords = cls._calculate_score(prompt_lower, space)
            
            if score > best_score:
                best_score = score
                best_match = space
                best_keywords = matched_keywords
        
        if best_match and best_score >= 0.3:
            return MatchResult(
                matched=True,
                space=SpaceInfo(**{k: best_match[k] for k in SpaceInfo.__fields__.keys() if k in best_match}),
                confidence=min(best_score, 1.0),
                matchedKeywords=best_keywords
            )
        
        return MatchResult(matched=False, confidence=0.0)
    
    @classmethod
    async def _llm_intent_match(cls, prompt: str) -> MatchResult:
        """Use LLM to understand user intent and match to spaces."""
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return MatchResult(matched=False, confidence=0.0)
        
        # Build space descriptions for the LLM
        spaces_desc = []
        for space in REGISTRY.get("spaces", []):
            spaces_desc.append(f"""
- **{space['id']}** ({space['name']}): {space['description']}
  Required inputs: {', '.join(i['name'] for i in space.get('inputs', []) if i.get('required', False))}
""")
        
        system_prompt = f"""You are an intelligent intent classifier for an e-commerce AI assistant.
Your task is to determine if a user's request can be handled by one of our pre-built "spaces" (specialized AI workflows).

Available Spaces:
{chr(10).join(spaces_desc)}

Instructions:
1. Analyze the user's intent - what are they actually trying to accomplish?
2. Determine if ANY of the available spaces can fulfill this request
3. Consider semantic similarity, not just keyword matching
4. A space should match if the user's end goal aligns with what the space produces

Examples of intelligent matching:
- "Make my product look professional" → background-remover (clean product shots look professional)
- "I want lifestyle shots of my sneakers on a beach" → product-swap (swap product into beach scene)
- "Create images like this magazine ad" → steal-the-look (style transfer from reference)
- "Turn my napkin drawing into a real product photo" → sketch-to-product
- "I need a transparent PNG of this item" → background-remover

Respond in JSON format:
{{
  "matched": true/false,
  "space_id": "space-id-here" or null,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this space matches or doesn't match"
}}

Only match if confidence >= 0.6. If the request is complex and needs multiple steps or doesn't clearly map to a single space, set matched=false."""

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{cls.GEMINI_API_URL}?key={api_key}",
                    json={
                        "contents": [
                            {"role": "user", "parts": [{"text": f"{system_prompt}\n\nUser request: {prompt}"}]}
                        ],
                        "generationConfig": {
                            "temperature": 0.1,
                            "maxOutputTokens": 256,
                            "responseMimeType": "application/json"
                        }
                    }
                )
                
                if response.status_code != 200:
                    return MatchResult(matched=False, confidence=0.0)
                
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                
                # Parse LLM response
                result = json.loads(text)
                
                if result.get("matched") and result.get("confidence", 0) >= 0.6:
                    space_id = result.get("space_id")
                    # Find the space
                    for space in REGISTRY.get("spaces", []):
                        if space["id"] == space_id:
                            return MatchResult(
                                matched=True,
                                space=SpaceInfo(**{k: space[k] for k in SpaceInfo.__fields__.keys() if k in space}),
                                confidence=result.get("confidence", 0.7),
                                matchedKeywords=[f"intent:{result.get('reasoning', 'LLM matched')}"]
                            )
                
                return MatchResult(matched=False, confidence=result.get("confidence", 0.0))
                
        except Exception as e:
            print(f"LLM intent matching failed: {e}")
            return MatchResult(matched=False, confidence=0.0)
    
    @classmethod
    def _calculate_score(cls, prompt: str, space: Dict[str, Any]) -> tuple[float, List[str]]:
        """Calculate match score for a space (rule-based fallback)."""
        score = 0.0
        matched_keywords = []
        
        # Keyword matching (0.2 points per keyword, max 0.6)
        keywords = space.get("keywords", [])
        for keyword in keywords:
            if keyword.lower() in prompt:
                score += 0.2
                matched_keywords.append(keyword)
        score = min(score, 0.6)
        
        # Pattern matching (0.4 points per pattern match)
        patterns = space.get("patterns", [])
        for pattern in patterns:
            try:
                if re.search(pattern, prompt, re.IGNORECASE):
                    score += 0.4
                    matched_keywords.append(f"pattern:{pattern}")
                    break  # Only count one pattern match
            except re.error:
                continue
        
        return score, matched_keywords


# === API Routes ===

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "BrandWork Space Runtime",
        "version": REGISTRY.get("version", "1.0.0"),
        "spaces_count": len(REGISTRY.get("spaces", []))
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "stage": os.getenv("STAGE", "dev")}


@app.get("/spaces", response_model=List[SpaceInfo])
async def list_spaces():
    """List all available spaces."""
    spaces = []
    for space in REGISTRY.get("spaces", []):
        spaces.append(SpaceInfo(**{k: space[k] for k in SpaceInfo.__fields__.keys() if k in space}))
    return spaces


@app.get("/spaces/{space_id}", response_model=SpaceInfo)
async def get_space(space_id: str):
    """Get details for a specific space."""
    for space in REGISTRY.get("spaces", []):
        if space["id"] == space_id:
            return SpaceInfo(**{k: space[k] for k in SpaceInfo.__fields__.keys() if k in space})
    raise HTTPException(status_code=404, detail=f"Space not found: {space_id}")


@app.post("/spaces/{space_id}/execute", response_model=SpaceOutput)
async def execute_space(space_id: str, body: SpaceInput):
    """Execute a space with the given inputs."""
    # Validate space exists
    space_exists = any(s["id"] == space_id for s in REGISTRY.get("spaces", []))
    if not space_exists:
        raise HTTPException(status_code=404, detail=f"Space not found: {space_id}")
    
    try:
        result = await SpaceExecutor.execute(space_id, body.inputs)
        return SpaceOutput(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return SpaceOutput(
            success=False,
            error=str(e),
            outputAssets=[]
        )


@app.post("/match", response_model=MatchResult)
async def match_prompt(prompt: str, use_llm: bool = True):
    """
    Match a user prompt to the best space using intelligent intent detection.
    
    Args:
        prompt: User's natural language request
        use_llm: Whether to use LLM for intent detection (default: True)
    
    The matching uses a two-phase approach:
    1. Fast rule-based matching for obvious cases (keywords, patterns)
    2. LLM-based semantic intent matching for complex/ambiguous requests
    """
    return await SpaceMatcher.match(prompt, use_llm=use_llm)


@app.post("/match-and-execute", response_model=SpaceOutput)
async def match_and_execute(prompt: str, body: SpaceInput, use_llm: bool = True):
    """
    Match a prompt to a space using intelligent intent detection and execute it.
    
    This is the primary endpoint for the "spaces first" flow:
    1. Intelligently match user intent to available spaces
    2. If high confidence match, execute the space directly
    3. If no match, return error (caller should fall back to orchestration)
    """
    match_result = await SpaceMatcher.match(prompt, use_llm=use_llm)
    
    if not match_result.matched or not match_result.space:
        return SpaceOutput(
            success=False,
            error=f"No matching space found for prompt. Confidence: {match_result.confidence}. Consider using Claude Code orchestration for complex tasks.",
            outputAssets=[],
            metadata={
                "matched": False,
                "confidence": match_result.confidence,
                "suggestion": "Use Claude Code with space MCP tools for complex multi-step tasks"
            }
        )
    
    try:
        result = await SpaceExecutor.execute(match_result.space.id, body.inputs)
        result["metadata"] = {
            "matched_space": match_result.space.id,
            "confidence": match_result.confidence,
            "matched_keywords": match_result.matchedKeywords,
            "intent_based": any("intent:" in k for k in match_result.matchedKeywords)
        }
        return SpaceOutput(**result)
    except Exception as e:
        return SpaceOutput(
            success=False,
            error=str(e),
            outputAssets=[]
        )


# === Planning Endpoint for Complex Tasks ===

class PlanStep(BaseModel):
    """A step in a task plan."""
    step_number: int
    action: str  # "space", "browse", "analyze", "ask_user"
    description: str
    space_id: Optional[str] = None
    inputs_needed: List[str] = []
    depends_on: List[int] = []


class TaskPlan(BaseModel):
    """A plan for completing a complex task."""
    is_simple: bool  # True if a single space can handle it
    matched_space: Optional[SpaceInfo] = None
    confidence: float
    steps: List[PlanStep] = []
    reasoning: str


@app.post("/plan", response_model=TaskPlan)
async def plan_task(prompt: str):
    """
    Analyze a user request and create a plan for completing it.
    
    This is the entry point for the intelligent orchestration flow:
    1. If simple task → returns is_simple=True with matched_space
    2. If complex task → returns multi-step plan using spaces + other actions
    
    The orchestrator (Claude Code) uses this to decide:
    - Simple: Execute space directly
    - Complex: Follow the plan, calling spaces as MCP tools
    """
    # First, try simple matching
    match_result = await SpaceMatcher.match(prompt, use_llm=True)
    
    if match_result.matched and match_result.confidence >= 0.7:
        return TaskPlan(
            is_simple=True,
            matched_space=match_result.space,
            confidence=match_result.confidence,
            steps=[],
            reasoning=f"Direct space match: {match_result.matchedKeywords}"
        )
    
    # Complex task - use LLM to create a plan
    plan = await _create_task_plan(prompt)
    return plan


async def _create_task_plan(prompt: str) -> TaskPlan:
    """Use LLM to create a multi-step plan for complex tasks."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return TaskPlan(
            is_simple=False,
            confidence=0.0,
            steps=[],
            reasoning="LLM not available for planning"
        )
    
    spaces_desc = []
    for space in REGISTRY.get("spaces", []):
        spaces_desc.append(f"- {space['id']}: {space['description']}")
    
    system_prompt = f"""You are a task planner for an e-commerce AI assistant.
Given a user request, create a step-by-step plan to accomplish it.

Available Spaces (pre-built AI workflows):
{chr(10).join(spaces_desc)}

Available Actions:
- "space": Use one of the pre-built spaces
- "browse": Browse the web to gather information/images
- "analyze": Analyze data, images, or content
- "ask_user": Ask the user for clarification or additional inputs

Create a plan with numbered steps. Each step should specify:
- What action to take
- What space to use (if action is "space")
- What inputs are needed
- Which previous steps it depends on

Respond in JSON:
{{
  "steps": [
    {{
      "step_number": 1,
      "action": "browse",
      "description": "Browse competitor website to gather reference images",
      "space_id": null,
      "inputs_needed": ["competitor_url"],
      "depends_on": []
    }},
    {{
      "step_number": 2,
      "action": "space",
      "description": "Apply the competitor's style to our product",
      "space_id": "steal-the-look",
      "inputs_needed": ["product_image", "reference_image_from_step_1"],
      "depends_on": [1]
    }}
  ],
  "reasoning": "This task requires gathering reference images first, then applying style transfer"
}}"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{SpaceMatcher.GEMINI_API_URL}?key={api_key}",
                json={
                    "contents": [
                        {"role": "user", "parts": [{"text": f"{system_prompt}\n\nUser request: {prompt}"}]}
                    ],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 1024,
                        "responseMimeType": "application/json"
                    }
                }
            )
            
            if response.status_code != 200:
                return TaskPlan(is_simple=False, confidence=0.0, steps=[], reasoning="Planning failed")
            
            data = response.json()
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
            result = json.loads(text)
            
            steps = [PlanStep(**step) for step in result.get("steps", [])]
            
            return TaskPlan(
                is_simple=False,
                confidence=0.8 if steps else 0.0,
                steps=steps,
                reasoning=result.get("reasoning", "Complex task requires multiple steps")
            )
            
    except Exception as e:
        print(f"Task planning failed: {e}")
        return TaskPlan(
            is_simple=False,
            confidence=0.0,
            steps=[],
            reasoning=f"Planning failed: {str(e)}"
        )


# === Brand Asset Upload ===

import base64
from shared_libs.libs.storage_client import upload_to_s3


@app.post("/upload-brand-asset", response_model=BrandAssetResponse)
async def upload_brand_asset(body: BrandAssetUpload):
    """
    Upload a brand asset (logo, character, scene, site image) to S3.
    
    Args:
        body: BrandAssetUpload with brand_id, asset_type, filename, content_type, image_base64
    
    Returns:
        BrandAssetResponse with the public S3 URL
    """
    # Validate asset_type
    valid_asset_types = ["logos", "characters", "scenes", "site-images"]
    if body.asset_type not in valid_asset_types:
        return BrandAssetResponse(
            success=False,
            error=f"Invalid asset_type. Must be one of: {', '.join(valid_asset_types)}"
        )
    
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(body.image_base64)
        
        # Upload to S3 with brand-specific path
        # Path: brand-memory/{brand_id}/{asset_type}/{filename}
        folder = f"brand-memory/{body.brand_id}/{body.asset_type}"
        url = await upload_to_s3(
            filename=body.filename,
            file_bytes=image_bytes,
            content_type=body.content_type,
            folder=folder
        )
        
        return BrandAssetResponse(success=True, url=url)
        
    except Exception as e:
        return BrandAssetResponse(
            success=False,
            error=f"Failed to upload asset: {str(e)}"
        )


# === Chat Attachment Upload ===

@app.post("/upload-chat-attachment", response_model=ChatAttachmentResponse)
async def upload_chat_attachment(body: ChatAttachmentUpload):
    """
    Upload a file attached to a chat message to S3.
    
    Files are stored in: chat-attachments/{task_id}/{filename}
    Files are automatically deleted after 7 days via S3 lifecycle policy.
    
    Args:
        body: ChatAttachmentUpload with task_id, filename, content_type, base64_data
    
    Returns:
        ChatAttachmentResponse with the public S3 URL and file_id
    """
    try:
        # Decode base64 data
        file_bytes = base64.b64decode(body.base64_data)
        
        # Upload to S3 with task-specific path
        # Path: chat-attachments/{task_id}/{filename}
        folder = f"chat-attachments/{body.task_id}"
        url = await upload_to_s3(
            filename=body.filename,
            file_bytes=file_bytes,
            content_type=body.content_type,
            folder=folder
        )
        
        # Generate a file_id for reference
        file_id = f"{body.task_id}_{body.filename}"
        
        return ChatAttachmentResponse(success=True, url=url, file_id=file_id)
        
    except Exception as e:
        return ChatAttachmentResponse(
            success=False,
            error=f"Failed to upload attachment: {str(e)}"
        )


# === Generated Image Upload ===

@app.post("/upload-generated-image", response_model=GeneratedImageResponse)
async def upload_generated_image(body: GeneratedImageUpload):
    """
    Upload an AI-generated image to S3 for persistence.
    
    Files are stored in: generated-images/{task_id}/{filename}
    Files are automatically deleted after 7 days via S3 lifecycle policy.
    
    Args:
        body: GeneratedImageUpload with task_id, filename, base64_data
    
    Returns:
        GeneratedImageResponse with the public S3 URL
    """
    try:
        # Decode base64 data
        file_bytes = base64.b64decode(body.base64_data)
        
        # Determine content type from filename
        ext = body.filename.lower().split('.')[-1] if '.' in body.filename else 'png'
        content_type_map = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
        }
        content_type = content_type_map.get(ext, 'image/png')
        
        # Upload to S3 with task-specific path
        # Path: generated-images/{task_id}/{filename}
        folder = f"generated-images/{body.task_id}"
        url = await upload_to_s3(
            filename=body.filename,
            file_bytes=file_bytes,
            content_type=content_type,
            folder=folder
        )
        
        return GeneratedImageResponse(success=True, url=url)
        
    except Exception as e:
        return GeneratedImageResponse(
            success=False,
            error=f"Failed to upload generated image: {str(e)}"
        )


# === Lambda Handler ===

handler = Mangum(app, lifespan="off")


# === Local Development ===

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
# Deployment timestamp: 1768912977
